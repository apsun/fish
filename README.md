# fish

fish (short for "file sharing") is a self-hosted file upload service. It
has two main goals:

- Be stupidly simple to deploy (run the binary and you're set)
- Be stupidly simple to use (blazing fast UI that works on all devices)

Files are uploaded as-is, meaning there is no additional encryption applied
to the files client-side. If you are looking for an end to end encrypted
file sharing solution like Firefox Send, you will need to do it manually
yourself using a tool like `gpg` or `age` before uploading it here. Note
that the file name is also stored unencrypted on the server.

## Technical notes

The server is written in Go. It basically just takes any file you POST to
`/upload`, generates a UUID, and writes the file to
`/tmp/fish/$uuid/$filename`. Users can then download the file by visiting
`/download/$uuid/$filename`.

Soon there will be a daemon that purges old files.

## License

MIT
