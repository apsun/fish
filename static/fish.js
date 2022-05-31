(function() {
    "use strict";

    class InfoText extends React.Component {
        render() {
            function li(text) {
                return React.createElement("li", {}, text);
            }

            return React.createElement("div", {},
                "fish is a stupid simple file sharing service. Rules:",
                React.createElement("ul", {},
                    li("Files are deleted after 15 minutes"),
                    li("Each file is limited to 200MiB"),
                    li("No illegal stuff, obviously"),
                ),
                "Note that files and metadata (file names) are NOT end to " +
                "end encrypted.",
            );
        }
    }

    // props.onFilesSelected - event handler for when a file is selected
    class FileInput extends React.Component {
        render() {
            return React.createElement("div", {},
                React.createElement("label", {className: "file-input"},
                    "Click here to select a file, or drag and drop anywhere " +
                    "on this page.",
                    React.createElement("input", {
                        type: "file",
                        multiple: true,
                        onChange: this.props.onFilesSelected,
                    }),
                ),
            );
        }
    }

    const UploadStatus = {
        NONE: 0,
        UPLOADING: 1,
        COMPLETED: 2,
        FAILED: 3,
    };

    // props.file - File object that we want to upload
    class UploadRow extends React.Component {
        constructor(props) {
            super(props);
            this.state = {
                status: UploadStatus.NONE,
                url: null,
                message: null,
                bytesUploaded: null,
                bytesTotal: null,
            };
        }

        startUpload() {
            if (![
                UploadStatus.NONE,
                UploadStatus.FAILED
            ].includes(this.state.status)) {
                console.log("Upload already in progress or completed");
                return;
            }

            let xhr = new XMLHttpRequest();
            xhr.upload.onprogress = this.onProgress.bind(this);
            xhr.onload = this.onLoad.bind(this);
            xhr.onerror = xhr.ontimeout = this.onError.bind(this);

            let fd = new FormData();
            fd.append("file", this.props.file);
            xhr.open("POST", "/upload", true);
            xhr.send(fd);

            this.xhr = xhr;
            this.setState({
                status: UploadStatus.UPLOADING,
                bytesUploaded: null,
                bytesTotal: null,
            });
        }

        abortUpload() {
            if (this.state.status !== UploadStatus.UPLOADING) {
                console.log("Aborting upload that is not in progress");
                return;
            }

            this.xhr.abort();
            this.setState({
                status: UploadStatus.FAILED,
                message: "Upload canceled by user",
            });
        }

        componentDidMount() {
            this.startUpload();
        }

        componentWillUnmount() {
            this.abortUpload();
        }

        onProgress(e) {
            let loaded = e.lengthComputable ? e.loaded : null;
            let total = e.lengthComputable ? e.total : null;
            this.setState({
                bytesUploaded: loaded,
                bytesTotal: total,
            });
        }

        onLoad(e) {
            if (this.xhr.status < 200 || this.xhr.status >= 300) {
                return this.onError(e);
            }

            this.setState({
                status: UploadStatus.COMPLETED,
                url: new URL(this.xhr.responseText, window.location.href).href,
            });
        }

        onError(e) {
            let message = "Upload failed :(";
            if (this.xhr.status !== 0) {
                message = this.xhr.responseText;
            }

            this.setState({
                status: UploadStatus.FAILED,
                message: message,
            });
        }

        onCopy(e) {
            if (this.state.status !== UploadStatus.COMPLETED) {
                console.log("Copying URL for non-completed upload");
                return;
            }

            // This is async, but we don't really need to await it
            navigator.clipboard.writeText(this.state.url);
        }

        onRetry(e) {
            this.startUpload();
        }

        onCancel(e) {
            this.abortUpload();
        }

        render() {
            function tr(...children) {
                return React.createElement("tr", {},
                    ...children.map((c) => React.createElement("td", {}, c))
                );
            }

            function span(text) {
                return React.createElement("span", {
                    // Show full text on hover
                    title: text,
                }, text);
            }

            function progressBar(value, max) {
                return React.createElement("progress", {
                    value: value,
                    max: max
                });
            }

            function readonlyTextInput(text) {
                return React.createElement("input", {
                    type: "text",
                    readOnly: true,
                    value: text,
                });
            }

            function button(text, click) {
                return React.createElement("button", {
                    onClick: click,
                }, text);
            }

            if (this.state.status === UploadStatus.UPLOADING) {
                return tr(
                    span(this.props.file.name),
                    progressBar(this.state.bytesUploaded, this.state.bytesTotal),
                    button("Cancel", this.onCancel.bind(this)),
                );
            } else if (this.state.status === UploadStatus.COMPLETED) {
                return tr(
                    span(this.props.file.name),
                    readonlyTextInput(this.state.url),
                    button("Copy URL", this.onCopy.bind(this)),
                );
            } else if (this.state.status === UploadStatus.FAILED) {
                return tr(
                    span(this.props.file.name),
                    readonlyTextInput(this.state.message),
                    button("Retry", this.onRetry.bind(this)),
                );
            }
        }
    }

    // props.files - array of File objects
    class UploadTable extends React.Component {
        render() {
            return React.createElement("table", {className: "upload-table"},
                React.createElement("colgroup", {},
                    React.createElement("col", {className: "filename-col"}),
                    React.createElement("col", {className: "status-col"}),
                    React.createElement("col", {className: "action-col"}),
                ),
                React.createElement("tbody", {},
                    ...this.props.files.map(
                        (f) => React.createElement(UploadRow, {file: f})
                    ),
                ),
            );
        }
    }

    // props.files - array of File objects
    // props.onFilesSelected - event handler for when a file is selected
    class Content extends React.Component {
        render() {
            return React.createElement("div", {className: "content"},
                React.createElement(InfoText),
                React.createElement(FileInput, {
                    onFilesSelected: this.props.onFilesSelected,
                }),
                React.createElement(UploadTable, {
                    files: this.props.files,
                }),
            );
        }
    }

    class App extends React.Component {
        constructor(props) {
            super(props);
            this.state = {files: []};
        }

        addFileList(fileList) {
            // fileList is not a real array, so we can't just
            // concat it directly to the current file list.
            let files = this.state.files.concat();
            for (let file of fileList) {
                files.push(file);
            }
            this.setState({files: files});
        }

        onDrop(e) {
            // Stop file from being opened
            e.preventDefault();

            this.addFileList(e.dataTransfer.files);
        }

        onDragOver(e) {
            // Stop file from being opened
            e.preventDefault();
        }

        onFilesSelected(e) {
            this.addFileList(e.target.files);
        }

        render() {
            return React.createElement(React.StrictMode, {},
                React.createElement(
                    "div",
                    {
                        id: "root-inner",
                        onDrop: this.onDrop.bind(this),
                        onDragOver: this.onDragOver.bind(this),
                    },
                    React.createElement(Content, {
                        files: this.state.files,
                        onFilesSelected: this.onFilesSelected.bind(this),
                    }),
                ),
            );
        }
    }

    let root = ReactDOM.createRoot(document.getElementById("root"));
    root.render(React.createElement(App));
})();
