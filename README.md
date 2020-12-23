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

## Running the server

It is highly recommended that you run fish inside of a chroot as a
dedicated user, as an added layer of security just in case someone manages
to find a way to escape the upload directory. While you can technically
run it directly as any user, you open yourself up to attackers. Also, it
protects the system in case the deletion logic goes haywire and starts
nuking system files.

The provided `run-server.sh` takes care of setting up the chroot for you.
Simply configure it with the user and port you want, and it will do the
rest. Make sure to create a new user:group just for fish.

## Technical notes

The server is written in Go. It basically just takes any file you POST to
`/upload`, generates a UUID, and writes the file to
`/tmp/fish/$uuid/$filename`. Users can then download the file by visiting
`/download/$uuid/$filename`.

## License

MIT
