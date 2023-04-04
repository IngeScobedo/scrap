const express = require("express");
const fs = require("fs");
const pdf2img = require("pdf-img-convert");
const { PNG } = require("pngjs");
const jsQR = require("jsqr");
const { chromium } = require("playwright");
const fileUpload = require("express-fileupload");

const app = express();

// Set up middleware for processing file uploads
app.use(fileUpload());

// Set up a route for uploading PDF files
app.post("/upload", async (req, res) => {
  try {
    // Delete existing images if they exist
    fs.rmSync("./images", { recursive: true, force: true });

    // Create a new directory for images
    fs.mkdirSync("./images");

    // Check if a PDF file was uploaded
    if (!req.files || !req.files.pdfFile) {
      return res.status(400).json({ message: "No PDF file uploaded" });
    }

    // Save the uploaded PDF file to the server
    const pdfFile = req.files.pdfFile;
    const pdfFilePath = `./${pdfFile.name}`;
    await pdfFile.mv(pdfFilePath);

    // Convert the PDF to images
    const outputImages = await pdf2img.convert(pdfFilePath);

    // Loop through the output images and extract the QR code URL
    for (let i = 0; i < outputImages.length; i++) {
      const pathToImage = `./images/output${i}.png`;
      fs.writeFile(pathToImage, outputImages[i], function (error) {
        if (error) {
          console.error("Error: " + error);
        }
      });
    }

    // Loop through the output images and extract the QR code URL
    const links = [];
    for (let i = 0; i < outputImages.length; i++) {
      const pathToImage = `./images/output${i}.png`;

      // Read the image asynchronously
      fs.readFile(pathToImage, function (error, data) {
        if (error) {
          console.error("Error: " + error);
        } else {
          const png = PNG.sync.read(data);
          const code = jsQR(
            Uint8ClampedArray.from(png.data),
            png.width,
            png.height
          );
          const qrCodeText = code?.data;

          links.push(qrCodeText);
        }
      });
    }

    if (links) {
      // Use Playwright to navigate to the URL and extract data
      const browser = await chromium.launch();
      const page = await browser.newPage();
      await page.goto(links[0]);

      const user = {
        nombre: "",
        cp: "",
        regimen: "",
        situacion: "",
      };

      const rows = page.getByRole("gridcell");
      const count = await rows.count();
      for (let j = 0; j < count; ++j) {
        const row = await rows.nth(j).textContent();
        const nextRow =
          j < count - 1 ? await rows.nth(j + 1).textContent() : null;
        switch (row) {
          case "Nombre:":
            if (row && nextRow) user.nombre = nextRow;
            break;
          case "CP:":
            if (row && nextRow) user.cp = nextRow;
            break;
          case "Régimen:":
            if (row && nextRow) user.regimen = nextRow;
            break;
          case "Situación del contribuyente:":
            if (row && nextRow) user.situacion = nextRow;
            break;
        }
      }

      await browser.close();

      // Return the user data as a response to the client
      res.json({ user });
    }

    // Delete the uploaded PDF file from the server
    fs.unlinkSync(pdfFilePath);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An error occurred" });
  }
});

// Start the server
app.listen(3000, () => console.log("Server running on port 3000"));
