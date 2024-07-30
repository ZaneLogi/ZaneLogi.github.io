// refer to https://blog.hubspot.com/website/css-loading-animation

document.addEventListener("DOMContentLoaded", () => {
    const loader = document.getElementById("loader");
    const progressElement = document.getElementById("progress");

    // Simulate backend loading progress
    let progress = 0;

    const interval = setInterval(() => {
        // Simulate progress update from backend
        progress += 10;
        if (progress > 100) {
            progress = 100;
            clearInterval(interval);

            //loader.style.visibility = "hidden";
            //loader.style.height = 0;
            loader.remove();
        }
        // Update progress bar width
        progressElement.style.width = progress + "%";
    }, 500);
});
