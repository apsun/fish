(function() {
"use strict";

const UploadStatus = {
    NONE: 0,
    UPLOADING: 1,
    COMPLETED: 2,
    FAILED: 3,
};

class FileUpload {
    constructor(file) {
        this.file = file;
        this.name = file.name;
        this.xhr = null;
        this.status = UploadStatus.NONE;
        this.error = null;
        this.url = null;
        this.bytesUploaded = null;
        this.bytesTotal = null;
        this.listeners = [];
    }

    addListener(f) {
        this.listeners.push(f);
    }

    removeListener(f) {
        let index = this.listeners.indexOf(f);
        if (index >= 0) {
            this.listeners.splice(index, 1);
        }
    }

    callListeners() {
        for (let f of this.listeners) {
            f(this);
        }
    }

    handleProgress = (e) => {
        let loaded = e.lengthComputable ? e.loaded : null;
        let total = e.lengthComputable ? e.total : null;

        this.bytesUploaded = loaded;
        this.bytesTotal = total;
        this.callListeners();
    }

    handleLoad = (e) => {
        if (this.xhr.status < 200 || this.xhr.status >= 300) {
            return this.handleError(e);
        }

        let path = this.xhr.responseText;
        let url = new URL(path, window.location.href).href;

        this.status = UploadStatus.COMPLETED;
        this.url = url;
        this.callListeners();
    }

    handleError = (e) => {
        let error = "upload failed with unknown error";
        if (this.xhr.status !== 0) {
            error = this.xhr.responseText;
        }

        this.status = UploadStatus.FAILED;
        this.error = error;
        this.callListeners();
    }

    start() {
        if ([
            UploadStatus.UPLOADING,
            UploadStatus.COMPLETED,
        ].includes(this.status)) {
            console.log("Upload already in progress or completed");
            return;
        }

        let xhr = new XMLHttpRequest();
        xhr.upload.onprogress = this.handleProgress;
        xhr.onload = this.handleLoad;
        xhr.onerror = xhr.ontimeout = this.handleError;

        let fd = new FormData();
        fd.append("file", this.file);
        xhr.open("POST", "/upload", true);
        xhr.send(fd);

        this.xhr = xhr;
        this.status = UploadStatus.UPLOADING;
        this.error = null;
        this.url = null;
        this.bytesUploaded = null;
        this.bytesTotal = null;
        this.callListeners();
    }

    abort() {
        if (this.status !== UploadStatus.UPLOADING) {
            console.log("Aborting upload that is not in progress");
            return;
        }

        this.xhr.abort();
        this.status = UploadStatus.FAILED;
        this.error = "upload aborted by user";
        this.callListeners();
    }
}

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
        max: max,
    });
}

function readonlyTextInput(text) {
    return React.createElement("input", {
        type: "text",
        readOnly: true,
        value: text,
    });
}

function button(text, onClick) {
    return React.createElement("button", {
        onClick: onClick,
    }, text);
}

function li(text) {
    return React.createElement("li", {}, text);
}

class InfoText extends React.Component {
    render() {
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

// props.onChange - event handler for when a file is selected
class FileInput extends React.Component {
    render() {
        return React.createElement("div", {},
            React.createElement("label", {className: "file-input"},
                "Click here to select a file, or drag and drop anywhere " +
                "on this page.",
                React.createElement("input", {
                    type: "file",
                    multiple: true,
                    onChange: this.props.onChange,
                }),
            ),
        );
    }
}

// props.file - FileUpload object
class UploadRow extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            status: UploadStatus.NONE,
            url: null,
            error: null,
            bytesUploaded: null,
            bytesTotal: null,
        };
    }

    handleFileUpdate = (file) => {
        this.setState({
            status: file.status,
            error: file.error,
            url: file.url,
            bytesUploaded: file.bytesUploaded,
            bytesTotal: file.bytesTotal,
        });
    }

    componentDidMount() {
        this.props.file.addListener(this.handleFileUpdate);
        this.props.file.start();
    }

    componentWillUnmount() {
        this.props.file.abort();
        this.props.file.removeListener(this.handleFileUpdate);
    }

    render() {
        if (this.state.status === UploadStatus.UPLOADING) {
            return tr(
                span(this.props.file.name),
                progressBar(this.state.bytesUploaded, this.state.bytesTotal),
                button("Cancel", (e) => this.props.file.abort()),
            );
        } else if (this.state.status === UploadStatus.COMPLETED) {
            return tr(
                span(this.props.file.name),
                readonlyTextInput(this.state.url),
                button("Copy URL", async (e) => {
                    await navigator.clipboard.writeText(this.state.url);
                }),
            );
        } else if (this.state.status === UploadStatus.FAILED) {
            return tr(
                span(this.props.file.name),
                readonlyTextInput(this.state.error),
                button("Retry", (e) => this.props.file.start()),
            );
        } else {
            return null;
        }
    }
}

// props.files - array of FileUpload objects
class CopyAllRow extends React.Component {
    handleCopyAllClick = async (e) => {
        let urls = this.props.files
            .filter((f) => f.status === UploadStatus.COMPLETED)
            .map((f) => f.url)
            .join("\n");

        await navigator.clipboard.writeText(urls);
    }

    render() {
        if (this.props.files.length < 2) {
            return null;
        }

        return React.createElement("tr", {},
            React.createElement("td", {colSpan: 3}, [
                button("Copy all URLs", this.handleCopyAllClick),
            ]),
        );
    }
}

// props.files - array of FileUpload objects
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
                React.createElement(CopyAllRow, {files: this.props.files}),
            ),
        );
    }
}

// props.files - array of FileUpload objects
// props.onFileInputChange - event handler for when a file is selected
class Content extends React.Component {
    render() {
        return React.createElement("div", {className: "content"},
            React.createElement(InfoText),
            React.createElement(FileInput, {
                onChange: this.props.onFileInputChange,
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
        let files = this.state.files.concat();
        for (let file of fileList) {
            files.push(new FileUpload(file));
        }
        this.setState({files: files});
    }

    handleDrop = (e) => {
        // Stop file from being opened
        e.preventDefault();

        this.addFileList(e.dataTransfer.files);
    }

    handleDragOver = (e) => {
        // Stop file from being opened
        e.preventDefault();
    }

    handleFileInputChange = (e) => {
        this.addFileList(e.target.files);
    }

    render() {
        return React.createElement(React.StrictMode, {},
            React.createElement(
                "div",
                {
                    id: "root-inner",
                    onDrop: this.handleDrop,
                    onDragOver: this.handleDragOver,
                },
                React.createElement(Content, {
                    files: this.state.files,
                    onFileInputChange: this.handleFileInputChange,
                }),
            ),
        );
    }
}

let root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App));

})();
