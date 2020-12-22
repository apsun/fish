(function() {
    "use strict";

    let body = document.getElementsByTagName("body")[0];
    let fileInput = document.getElementById("file-input");
    let fileTable = document.getElementById("file-table");

    function uploadFileImpl(tableRow, file) {
        let xhr = new XMLHttpRequest();

        // First column displays the file name.
        let filenameCol = document.createElement("td");
        let filenameLabel = document.createElement("label");
        filenameLabel.innerText = file.name;
        filenameCol.align = "right";
        filenameCol.appendChild(filenameLabel);
        tableRow.appendChild(filenameCol);

        // Second column displays the upload progress bar.
        let statusCol = document.createElement("td");
        let progressBar = document.createElement("progress");
        statusCol.appendChild(progressBar);
        tableRow.appendChild(statusCol);

        // Third column displays a cancel button.
        let actionCol = document.createElement("td");
        let cancelButton = document.createElement("button");
        cancelButton.innerText = "Cancel";
        cancelButton.onclick = (e) => {
            xhr.abort();
        };
        actionCol.appendChild(cancelButton);
        tableRow.appendChild(actionCol);

        // When we receive progress updates, update the progress
        // bar accordingly.
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                progressBar.max = e.total;
                progressBar.value = e.loaded;
            } else {
                progressBar.removeAttribute("value");
            }
        };

        // When the request finishes, replace the status view
        // with the URL of the file and the cancel button with
        // a copy button.
        xhr.onload = (e) => {
            if (xhr.status < 200 || xhr.status >= 300) {
                return xhr.onerror(e);
            }

            let input = document.createElement("input");
            input.type = "text";
            input.readOnly = true;
            input.value = new URL(xhr.responseText, window.location.href).href;
            statusCol.replaceChild(input, progressBar);

            let copyButton = document.createElement("button");
            copyButton.innerText = "Copy URL";
            copyButton.onclick = (e) => {
                input.select();
                document.execCommand("copy");
                input.blur();
                copyButton.innerText = "Copied!";
            };
            actionCol.replaceChild(copyButton, cancelButton);
        };

        // When the request fails, replace the status view with
        // an error message and the cancel button with a retry button.
        xhr.onerror = xhr.ontimeout = (e) => {
            let input = document.createElement("input");
            input.type = "text";
            input.readOnly = true;
            if (xhr.status === 0) {
                input.value = "request failed";
            } else {
                input.value = xhr.responseText;
            }
            statusCol.replaceChild(input, progressBar);

            let retryButton = document.createElement("button");
            retryButton.innerText = "Retry";
            retryButton.onclick = (e) => {
                // Reset the row (without removing the row itself,
                // since that will change its position) and recurse.
                while (tableRow.lastElementChild !== null) {
                    tableRow.removeChild(tableRow.lastElementChild);
                }
                uploadFileImpl(tableRow, file);
            };
            actionCol.replaceChild(retryButton, cancelButton);
        };

        // When the request is manually canceled by the user,
        // remove the row.
        xhr.onabort = (e) => {
            fileTable.removeChild(tableRow);
        };

        // Now we actually start the upload! Note that we need to
        // call open after setting up the event listeners; otherwise
        // we won't receive some events.
        let formData = new FormData();
        formData.append("file", file);
        xhr.open("POST", "/upload", true);
        xhr.send(formData);
    }

    function uploadFile(file) {
        let row = document.createElement("tr");
        uploadFileImpl(row, file);
        fileTable.appendChild(row);
    }

    function uploadFileList(fileList) {
        for (let file of fileList) {
            uploadFile(file);
        }
    }

    // When the user selects a file using the input control, start
    // the upload.
    fileInput.onchange = (e) => {
        uploadFileList(e.target.files);
        e.target.value = "";
    };

    // Make the whole page accept file drag and drop. On drop, start
    // the upload.
    body.ondrop = (e) => {
        e.preventDefault();
        let files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadFileList(e.dataTransfer.files);
        }
    };

    // Prevent the default drag and drop behavior. This is needed
    // to prevent the browser from just opening the dropped file.
    body.ondragover = (e) => {
        e.preventDefault();
    };
})();
