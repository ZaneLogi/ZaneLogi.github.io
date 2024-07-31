// refer to https://blog.hubspot.com/website/css-loading-animation
// refer to https://www.w3schools.com/jsref/prop_style_display.asp

document.addEventListener("DOMContentLoaded", () => {
    const progressElement = document.getElementById("progress");

    // Simulate backend loading progress
    let progress = 0;

    const interval = setInterval(() => {
        // Simulate progress update from backend
        progress += 10;
        if (progress > 100) {
            progress = 100;
            clearInterval(interval);

            // hide the loader
            document.getElementById("loader").style.display = "none";
        }
        // Update progress bar width
        progressElement.style.width = progress + "%";
    }, 500);
});
