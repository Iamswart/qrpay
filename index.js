const express = require("express");
const QRCode = require("qrcode");
const { createCanvas, loadImage } = require("canvas");
const AWS = require("aws-sdk");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const dotenv = require("dotenv");
const qrQueue = require("./queue");
const cloudinary = require("cloudinary").v2;


dotenv.config({});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});


const app = express();
const cors = require("cors");
const port = 3000;
const BUCKET_NAME = "qrcoded";
const MONGO_URI = process.env.MONGO_URI;
const MAX_QR_COUNT = 100;

// 2. Middleware and Configuration
app.use(express.json());
app.use(cors());

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
});

const s3 = new AWS.S3();

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// 3. Mongoose Schema and Model
const qrSchema = new mongoose.Schema({
  uuid: String,
  s3URL: String,
  firstName: { type: String, default: "" },
  lastName: { type: String, default: "" },
  accountNumber: { type: String, default: "" },
  isActivated: { type: Boolean, default: false },
});

const QRCodeModel = mongoose.model("QRCode", qrSchema);

qrQueue.process(async (job) => {
  try {
    const uuid = uuidv4();
    const data = `https://swartjide.com/?uuid=${uuid}`;
    const buffer = await generateCustomQRCode(data);
    const cloudinaryLink = await uploadToCloudinary(buffer); // Notice the change here
    const qrEntry = new QRCodeModel({ uuid, s3URL: cloudinaryLink }); // Maybe rename `s3URL` to a more generic name
    await qrEntry.save();
    return { uuid, s3URL: cloudinaryLink };
  } catch (error) {
    console.log(error);
  }
});

async function generateCustomQRCode(data) {
  const canvas = createCanvas(300, 300);
  const ctx = canvas.getContext("2d");

  await QRCode.toCanvas(canvas, data, {
    color: {
      dark: "#facb05",
      light: "#044c73",
    },
    width: 300,
    errorCorrectionLevel: "H",
  });

  const logo = await loadImage("momo.png");
  const logoSize = 60;
  const logoPosition = (canvas.width - logoSize) / 2;

  ctx.drawImage(logo, logoPosition, logoPosition, logoSize, logoSize);

  return canvas.toBuffer();
}


async function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream((error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result.url); // This will return the URL of the uploaded image on Cloudinary
      }
    });

    // Since Cloudinary's SDK expects a readable stream, we convert the buffer to one.
    const readableStream = require("stream").Readable.from(buffer);
    readableStream.pipe(uploadStream);
  });
}

// 6. API Endpoints
app.post("/generateQR", async (req, res) => {
  const count = Math.min(req.body.count || 1, MAX_QR_COUNT);
  for (let i = 0; i < count; i++) {
    await qrQueue.add({});
  }
  res.json({ message: `${count} QR Code(s) generation in process` });
});

app.post("/activate", async (req, res) => {
  const { id, firstName, lastName, accountNumber } = req.body;

  if (!id || !firstName || !lastName || !accountNumber) {
    return res.status(400).json({
      message:
        "All fields (id, firstName, lastName, accountNumber) are required.",
    });
  }

  try {
    const qrModel = await QRCodeModel.findOne({ uuid: id });

    if (!qrModel) {
      return res.status(404).json({ message: "QR Code not found." });
    }

    // Update the QR code model
    await qrModel.updateOne({
      isActivated: true,
      firstName: firstName,
      lastName: lastName,
      accountNumber: accountNumber,
    });

    res.json({ message: "Activation successful" });
  } catch (error) {
    console.error("Error activating QR code:", error);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/generateQR", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10; // Default limit is 10 items per page
  const skip = (page - 1) * limit;

  try {
    const qr = await QRCodeModel.find({}).limit(limit).skip(skip).exec();

    // Get total documents to calculate pages
    const totalDocs = await QRCodeModel.countDocuments();
    const totalPages = Math.ceil(totalDocs / limit);

    res.json({
      currentPage: page,
      totalDocs,
      totalPages,
      qr,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

app.post("/info", async (req, res) => {
  const id = req.body.id;
  const qrModel = await QRCodeModel.findOne({ uuid: id });
  res.json(qrModel);
});


app.delete("/qrCodes", async (req, res) => {
  try {
    // Deletes all documents in QRCodeModel collection
    const result = await QRCodeModel.deleteMany({});

    res.json({
      message: "All QR codes deleted successfully.",
      deletedCount: result.deletedCount, // Number of documents deleted
    });
  } catch (error) {
    console.error("Error deleting all QR codes:", error);
    res.status(500).json({ message: "Server error", error });
  }
});

// 7. Server Initialization
app.listen(port, () => {
  console.log(`Server started on http://localhost:${port}`);
});
