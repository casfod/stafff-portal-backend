// services/pdfService.js
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

class PDFService {
  async generateRFQPDF(rfqData) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];

        doc.on("data", buffers.push.bind(buffers));
        doc.on("end", () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });

        // Add logo (you'll need to handle logo file path)
        // doc.image('path/to/logo.webp', 50, 45, { width: 50 });

        // Add RFQ content similar to the React component
        this.addRFQContent(doc, rfqData);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  addRFQContent(doc, rfqData) {
    // Header
    doc.fontSize(20).text("CASFOD", 110, 57);
    doc.fontSize(10).text("UNIQUE CARE AND SUPPORT FOUNDATION", 110, 77);

    // RFQ Title and Code
    doc.fontSize(16).text("Request for Quotation", 400, 50, { align: "right" });
    doc.fontSize(12).text(rfqData.RFQCode, 400, 70, { align: "right" });

    // Add all the content from your RFQ template...
    // This would mirror the structure of RFQPDFTemplate component

    // Continue with delivery address, items table, terms, etc.
  }
}

module.exports = new PDFService();
