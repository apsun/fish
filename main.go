package main

import (
	"crypto/rand"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

var portFlag = flag.Int("port", 80, "port to listen on")
var uploadDirFlag = flag.String("uploaddir", "/tmp/fish", "where to store uploaded files")
var maxSizeFlag = flag.Int64("maxsize", 200<<20, "maximum file upload request size in bytes")
var expiryFlag = flag.Duration("expiry", 15*time.Minute, "delete uploaded files after this duration")

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
// Use a whitelist for now for paranoia, maybe in the future we can use a
// blacklist instead.
var unsafeCharsRegex = regexp.MustCompile("[^A-Za-z0-9-_., ~!@#$^&()+=\\[\\]]")

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
		msg := "only POST requests accepted"
		log.Println(msg)
		http.Error(w, msg, http.StatusBadRequest)
		return
	}

	uploadedFile, header, err := r.FormFile("file")
	if err != nil {
		msg := "missing `file` param, or param was not a file"
		if err != http.ErrMissingFile {
			msg = fmt.Sprintf("failed to get file from request: %v", err)
		}
		log.Println(msg)
		http.Error(w, msg, http.StatusBadRequest)
		return
	}

	fileID, err := uuid4()
	if err != nil {
		msg := fmt.Sprintf("failed to generate uuid: %v", err)
		log.Println(msg)
		http.Error(w, msg, http.StatusInternalServerError)
		return
	}

	fileName := safeFileName(header.Filename)
	dirPath := filepath.Join(*uploadDirFlag, fileID)
	filePath := filepath.Join(dirPath, fileName)
	urlPath := fmt.Sprintf("/download/%s/%s", fileID, url.PathEscape(fileName))

	log.Printf("writing %s\n", filePath)

	err = os.Mkdir(dirPath, 0o700)
	if err != nil {
		msg := fmt.Sprintf("failed to create dir %s: %v", dirPath, err)
		log.Println(msg)
		http.Error(w, msg, http.StatusInternalServerError)
		return
	}

	fsFile, err := os.OpenFile(filePath, os.O_WRONLY|os.O_CREATE, 0o600)
	if err != nil {
		msg := fmt.Sprintf("failed to create file %s: %v", filePath, err)
		log.Println(msg)
		http.Error(w, msg, http.StatusInternalServerError)
		return
	}
	defer fsFile.Close()

	_, err = io.Copy(fsFile, uploadedFile)
	if err != nil {
		msg := fmt.Sprintf("failed to write file %s: %v", filePath, err)
		log.Println(msg)
		http.Error(w, msg, http.StatusInternalServerError)
		return
	}

	// I would like to use a 303 redirect here instead of writing
	// the URL to the response body, but XMLHttpRequest doesn't allow
	// disabling redirect following, and fetch() doesn't support
	// upload progress.
	_, err = io.WriteString(w, urlPath)
	if err != nil {
		msg := fmt.Sprintf("failed to write response URL %s: %v", urlPath, err)
		log.Println(msg)
		http.Error(w, msg, http.StatusInternalServerError)
		return
	}
}

// File that bans directory enumeration.
type blindFile struct {
	http.File
}

func (f blindFile) Readdir(count int) ([]os.FileInfo, error) {
	// Slap the user with a 500. Ideally we would return a 400,
	// but the Go HTTP library treats any error coming out of this
	// function as an internal error no matter what we do.
	return nil, errors.New("directory enumeration is banned")
}

// Filesystem that bans directory enumeration.
type blindFileSystem struct {
	http.FileSystem
}

func (fs blindFileSystem) Open(name string) (http.File, error) {
	file, err := fs.FileSystem.Open(name)
	if err != nil {
		return nil, err
	}
	return blindFile{file}, nil
}

// http.FileServer wrapper handler that makes the browser download the
// file instead of rendering it.
func asAttachment(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Disposition", "attachment")
		h.ServeHTTP(w, r)
	})
}

// Purges the upload directory of files older than the configured
// expiry time.
func monitor() {
	for {
		files, err := ioutil.ReadDir(*uploadDirFlag)
		if err != nil {
			log.Fatalf("failed to enumerate %s: %v\n", *uploadDirFlag, err)
		}

		now := time.Now()
		for _, f := range files {
			ts := f.ModTime()
			if now.Sub(ts) > *expiryFlag {
				path := filepath.Join(*uploadDirFlag, f.Name())
				log.Printf("purging %s (created at %v)\n", path, ts)
				err = os.RemoveAll(path)
				if err != nil {
					log.Printf("failed to purge %s: %v\n", path, err)
				}
			}
		}

		time.Sleep(1 * time.Minute)
	}
}

func main() {
	flag.Parse()

	err := os.MkdirAll(*uploadDirFlag, 0o700)
	if err != nil {
		log.Fatalf("failed to create upload dir %s: %v\n", *uploadDirFlag, err)
	}

	go monitor()

	http.Handle("/", http.FileServer(http.Dir("static")))
	http.HandleFunc("/upload", uploadHandler)
	http.Handle("/download/", http.StripPrefix("/download/", asAttachment(
		http.FileServer(blindFileSystem{http.Dir(*uploadDirFlag)}),
	)))

	err = http.ListenAndServe(fmt.Sprintf(":%d", *portFlag), nil)
	if err != nil {
		log.Fatalf("http server returned error: %v\n", err)
	}
}
