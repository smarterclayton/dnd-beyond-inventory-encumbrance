chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        if (request.msg === "inventory") {
            alert("got inventory");
        }
    }
);

function textToFile(text, mimeType) {
    var byteCharacters = text;
    var byteNumbers = new Array(byteCharacters.length);
    for (var i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    var byteArray = new Uint8Array(byteNumbers);
    var file = new Blob([byteArray], {
        type: mimeType + ";base64",
    });
    return file;
}

chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    var tab = tabs[0]
    if (!tab) {
        console.error("No active tab");
        return;
    }

    chrome.storage.session.get('dnd_beyond_inventory_results_'+tab.id, function (result) {
        var data = result["dnd_beyond_inventory_results_"+tab.id];
        const title = data.title;
        const filename = data.filename;
        const markdown = data.markdown;
        contentsHtml = marked.parse(markdown);
        html = "<html><head>" + document.head.innerHTML + "</head><body>" + contentsHtml + "</body></html>";

        var markdownFileUrl = URL.createObjectURL(textToFile(markdown), "text/plain");
        var htmlFileUrl = URL.createObjectURL(textToFile(html), "text/html;charset=utf-8");

        var contentsDiv =  document.getElementById("contents");
        contentsDiv.innerHTML = contentsHtml;

        document.getElementById("as_markdown").onclick = function (evt) {
            document.getElementById('contents').innerHTML = "<pre>" + markdown + "</pre>";
            document.getElementById("as_markdown").parentElement.style.display = "none";
        };

        var mdLink = document.getElementById("download_markdown");
        mdLink.download = filename + ".md";
        mdLink.href = markdownFileUrl
        mdLink.addEventListener('click', () => {
            chrome.downloads.download({ url: markdownFileUrl, filename: mdLink.download })
                .finally(() => URL.revokeObjectURL(markdownFileUrl) );
            return false;
        });

        var htmlLink = document.getElementById("download_html");
        htmlLink.download = filename + ".html";
        htmlLink.href = htmlFileUrl;
        htmlLink.addEventListener('click', () => {
            chrome.downloads.download({ url: markdownFileUrl, filename: htmlLink.download })
                .finally(() => URL.revokeObjectURL(markdownFileUrl) );
            return false;
        });
    });
});