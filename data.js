console.log("popup")

chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        if (request.msg === "inventory") {
            alert("got inventory");
        }
    }
);

var markdown = "<error>";
chrome.storage.local.get('dnd_beyond_inventory_results', function(result) {
   console.log(result);
    markdown = result.dnd_beyond_inventory_results;
    document.getElementById("markdown").innerHTML = marked.parse(markdown);

    document.getElementById("as_markdown").onclick = function(evt) {
        document.getElementById('markdown').innerHTML = "<pre>"+markdown+"</pre>";
        document.getElementById("as_markdown").parentElement.style.display = "none"
    };
});