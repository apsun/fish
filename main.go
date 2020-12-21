package main

import (
	"crypto/rand"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

var storageFlag = flag.String("storage", "/tmp/fish", "where to store uploaded files")
var portFlag = flag.Int("port", 80, "port to listen on")

func uuid4() (string, error) {
	buf := make([]byte, 16)
	_, err := rand.Read(buf)
	if err != nil {
		return "", err
	}

	buf[6] = (buf[6] & 0x0f) | 0x40
	buf[8] = (buf[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x", buf), nil
}

func uploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Only POST requests accepted", http.StatusBadRequest)
		return
	}

	err := r.ParseMultipartForm(100 << 20)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	uploadedFile, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	fileID, err := uuid4()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	fileName := header.Filename
	dirPath := filepath.Join(*storageFlag, fileID)
	filePath := filepath.Join(dirPath, fileName)
	urlPath := fmt.Sprintf("/download/%s/%s", fileID, fileName)

	err = os.Mkdir(dirPath, os.ModePerm)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	fsFile, err := os.Create(filePath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_, err = io.Copy(fsFile, uploadedFile)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_, err = io.WriteString(w, urlPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

func downloadHandler(w http.ResponseWriter, r *http.Request) {
	relativePath := strings.TrimPrefix(r.URL.Path, "/download/")
	filePath := filepath.Join(*storageFlag, relativePath)

	w.Header().Set("Content-Disposition", "attachment")
	http.ServeFile(w, r, filePath)
}

func main() {
	flag.Parse()

	err := os.MkdirAll(*storageFlag, os.ModePerm)
	if err != nil {
		panic(err)
	}

	http.Handle("/", http.FileServer(http.Dir("static")))
	http.HandleFunc("/upload", uploadHandler)
	http.HandleFunc("/download/", downloadHandler)

	err = http.ListenAndServe(fmt.Sprintf(":%d", *portFlag), nil)
	if err != nil {
		panic(err)
	}
}
