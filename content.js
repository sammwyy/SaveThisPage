chrome.runtime.onMessage.addListener((request, _sender, _sendResponse) => {
  if (request.action === "downloadThisPage") {
    console.log("[SaveThisPage] Requested download page action.");
    downloadThisPage(); // Call the main function to download the webpage
  }
});

async function downloadThisPage() {
  // Set state to fetching.
  __setAppState("fetching");

  const htmlContent = document.documentElement.outerHTML;
  const baseUrl = window.location.origin;

  // Create a new DOM parser and parse the input HTML string.
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, "text/html");

  // Query all downloadable content.
  const images = Array.from(doc.querySelectorAll("img[src]"));
  const videos = Array.from(doc.querySelectorAll("video[src]"));
  const audios = Array.from(doc.querySelectorAll("audio[src]"));
  const scripts = Array.from(doc.querySelectorAll("script[src]"));
  const styles = Array.from(doc.querySelectorAll("link[rel='stylesheet']"));
  const all = [...images, ...videos, ...audios, ...scripts, ...styles];

  // Set state to downloading.
  __setAppState("downloading", { total: all.length });

  // Download all content.
  const content = await Promise.all([
    ...images.map((image) => __downloadResource(baseUrl, image.src)),
    ...videos.map((video) => __downloadResource(baseUrl, video.src)),
    ...audios.map((audio) => __downloadResource(baseUrl, audio.src)),
    ...styles.map((link) => __downloadResource(baseUrl, link.href)),
    ...scripts.map((script) =>
      __downloadResource(baseUrl, script.src, "text/plain")
    ),
  ]);

  // Set state to finishing.
  __setAppState("finishing");

  // Normalize DOM.
  const origins = doc.querySelectorAll(
    "link[crossorigin], script[crossorigin]"
  );
  origins.forEach((element) => {
    element.removeAttribute("crossorigin");
  });

  // Replace DOM links.
  const cachedUrls = new Map();
  content.forEach((res) => {
    if (res != null) {
      cachedUrls.set(res.absoluteUrl, res.relativeUrl);
    }
  });

  all.forEach((element) => {
    // Replace src.
    const src = element.getAttribute("src");
    if (src) {
      const newSrc = cachedUrls.get(src);
      if (newSrc) element.setAttribute("src", newSrc);
    }

    // Replace href.
    const href = element.getAttribute("href");
    if (href) {
      const newHref = cachedUrls.get(href);
      if (newHref) element.setAttribute("href", newHref);
    }
  });

  // Serialize index.html and include it to content array.
  const serializer = new XMLSerializer();
  const domAsString = serializer.serializeToString(doc);
  content.push({
    absoluteUrl: baseUrl,
    content: domAsString,
    relativeUrl: "index.html",
  });

  // Create ZIP file.
  const zip = await __createZipFile(content);

  // Download generated zip file.
  __triggerDownload(zip, "website.zip");
}

/**
 * Aux functions
 */

// Function to set global app state
function __setAppState(state, args = {}) {
  chrome.runtime.sendMessage({
    action: "setState",
    info: {
      state,
      ...args,
    },
  });
}

function __hitFileDownload(relativePath) {
  chrome.runtime.sendMessage({
    action: "hitFileDownload",
    info: {
      name: relativePath,
    },
  });
}

// Function to convert URL to relative
function __getRelativeUrl(url, baseUrl) {
  const parsedUrl = new URL(url);
  if (parsedUrl.origin === baseUrl) {
    return parsedUrl.pathname.replace(/^\/+/, ""); // Remove leading slashes
  } else {
    return `_/` + parsedUrl.host + parsedUrl.pathname; // Format for external domains
  }
}

// Function to convert URL to absolute
function __getAbsoluteUrl(url, baseUrl) {
  try {
    // If the URL is already absolute, return it
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    // If the URL is relative, construct it with the baseUrl
    return new URL(url, baseUrl).href;
  } catch (error) {
    console.error(`Failed to construct absolute URL for ${url}: ${error}`);
    return null; // Return null if the URL is invalid
  }
}

// Function for resource downloading
async function __downloadResource(baseUrl, url, type = "blob") {
  const absoluteUrl = __getAbsoluteUrl(url, baseUrl);
  if (!absoluteUrl) {
    console.error(`Invalid URL: ${url}`);
    return;
  }

  try {
    const response = await fetch(absoluteUrl);
    if (!response.ok) throw new Error(`Failed to fetch ${absoluteUrl}`);

    const content =
      type === "text/plain" ? await response.text() : await response.blob();
    let relativeUrl = __getRelativeUrl(absoluteUrl, baseUrl);

    // Check for Base64 file
    const isBase64 = absoluteUrl.startsWith("data:");
    if (isBase64) {
      const ext = content.type?.split("/")[1];
      const randomName = `${Math.random().toString(36).substring(2, 15)}`;
      relativeUrl = `_/_image/${randomName}.${ext}`;
    }

    // Print size in KB and bytes
    const sizeInKb = Math.round(content.size / 1024);
    __hitFileDownload(relativeUrl);
    console.log(
      `[SaveThisPage] Downloaded resource ${absoluteUrl} (${sizeInKb}kb)`
    );

    return {
      relativeUrl,
      absoluteUrl,
      content,
    };
  } catch (error) {
    console.error(`Error downloading resource ${absoluteUrl}: ${error}`);
  }
}

// Create a ZIP file
async function __createZipFile(resources = new Set()) {
  const zip = new JSZip();

  // Add each resource to the ZIP
  resources.forEach((res) => {
    if (res != null) {
      zip.file(res.relativeUrl, res.content);
    }
  });

  // Generate the ZIP file as a Blob
  const zipContent = await zip.generateAsync({ type: "blob" });
  return zipContent;
}

// Function to trigger download
function __triggerDownload(content, filename) {
  const a = document.createElement("a");
  const blob = new Blob([content], { type: "application/zip" });
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a); // Clean up after download
}
