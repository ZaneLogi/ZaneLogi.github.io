Running this from local would get the following error.

index.js:15  Uncaught DOMException: Failed to execute 'getImageData' on 'CanvasRenderingContext2D': The canvas has been tainted by cross-origin data.
    at draw (file:///C:/ZaneLogi.github.io/set_color_key/index.js:15:34)
    at sprite.onload (file:///C:/ZaneLogi.github.io/set_color_key/index.js:6:5)


refer to
1. [How to fix getImageData() error The canvas has been tainted by cross-origin data?](https://stackoverflow.com/questions/22097747/how-to-fix-getimagedata-error-the-canvas-has-been-tainted-by-cross-origin-data)
2. [I get a "Canvas has been tainted" error in Chrome but not in FF](https://stackoverflow.com/questions/16217521/i-get-a-canvas-has-been-tainted-error-in-chrome-but-not-in-ff/16218015#16218015)

Summary: Chrome does not consider different local files to be sourced from the same domain.
Running a local http server would fix this.

To run this page
1. run a http server in the project root folder => python -m http.server -b 127.0.0.1 8080
2. open the url in a browser => http://127.0.0.1:8080/set_color_key/

Note: to exit the http server, press ctrl + c
