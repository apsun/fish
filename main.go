package main

import (
	"crypto/rand"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
)

var portFlag = flag.Int("port", 80, "port to listen on")
var storageFlag = flag.String("storage", "/tmp/fish", "where to store uploaded files")
var maxSizeFlag = flag.Int64("maxsize", 200<<20, "maximum file upload request size")

// Returns a cryptographically secure version 4 UUID.
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

// Set of characters that are not safe to use in a file name.
var unsafeCharsRegex = regexp.MustCompile("[^A-Za-z0-9-_.]")

// Replaces all non-whitelisted characters in `fileName` with an underscore.
func safeFileName(fileName string) string {
	return unsafeCharsRegex.ReplaceAllString(fileName, "_")
}

// POST handler for the /upload endpoint. Writes the file to the configured
// storage directory, and writes a URL that the user can use to retrieve the
// file to the response body.
func uploadHandler(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, *maxSizeFlag)

	if r.Method != "POST" {
		http.Error(w, "only POST requests accepted", http.StatusBadRequest)
		return
	}

	uploadedFile, header, err := r.FormFile("file")
	if err != nil {
		if err == http.ErrMissingFile {
			http.Error(
				w,
				"missing `file` param, or param was not a file",
				http.StatusBadRequest,
			)
		} else {
			http.Error(w, err.Error(), http.StatusBadRequest)
		}
		return
	}

	fileID, err := uuid4()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	fileName := safeFileName(header.Filename)
	dirPath := filepath.Join(*storageFlag, fileID)
	filePath := filepath.Join(dirPath, fileName)
	urlPath := fmt.Sprintf("/download/%s/%s", fileID, url.PathEscape(fileName))

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

// http.FileServer wrapper handler that makes the browser download the
// file instead of rendering it.
func asAttachment(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Disposition", "attachment")
		h.ServeHTTP(w, r)
	})
}

func main() {
	flag.Parse()

	err := os.MkdirAll(*storageFlag, os.ModePerm)
	if err != nil {
		panic(err)
	}

	http.Handle("/", http.FileServer(http.Dir("static")))
	http.HandleFunc("/upload", uploadHandler)
	http.Handle("/download/", http.StripPrefix("/download/", asAttachment(
		http.FileServer(http.Dir(*storageFlag)),
	)))

	err = http.ListenAndServe(fmt.Sprintf(":%d", *portFlag), nil)
	if err != nil {
		panic(err)
	}
}
