let totalFiles = 0;
let downloadedFiles = 0;

// Listen for download button clicked.
document.getElementById("downloadBtn").addEventListener("click", async () => {
  // Reset progress
  downloadedFiles = 0;
  document.getElementById("progressBar").style.width = "0%";
  document.getElementById("statusText").innerText = "Starting download...";

  // Send a message to the content script to start the download
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    console.log("[SaveThisPage] Triggering page download...");
    chrome.tabs.sendMessage(tabs[0].id, { action: "downloadThisPage" });
  });
});

// Listen for app state changes.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "setState") {
    const { state, total } = request.info;
    // State variables: fetching, downloading, finishing.
    // Total is only available when state is downloading.
    console.log("Change state to ", state);

    if (state === "downloading") {
      totalFiles = total;
      document.getElementById(
        "statusText"
      ).innerText = `Downloading... (${downloadedFiles}/${totalFiles})`;
    }
  } else if (request.action === "hitFileDownload") {
    const { name } = request.info;
    console.log("Downloaded file", name);
    downloadedFiles++;

    // Update progress bar
    const percentage = ((downloadedFiles / totalFiles) * 100).toFixed(0);
    document.getElementById("progressBar").style.width = `${percentage}%`;
    document.getElementById(
      "statusText"
    ).innerText = `Downloading... (${downloadedFiles}/${totalFiles})`;

    // If all files are downloaded, update status
    if (downloadedFiles === totalFiles) {
      document.getElementById("statusText").innerText = "Download complete!";
    }
  }
});
