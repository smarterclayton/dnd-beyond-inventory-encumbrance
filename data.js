console.log("popup")

chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        if (request.msg === "inventory") {
            alert("got inventory");
        }
    }
);