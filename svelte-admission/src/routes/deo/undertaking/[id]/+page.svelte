<script lang="ts">
  import pdfMake from "pdfmake/build/pdfmake.js";
  import pdfFonts from "pdfmake/build/vfs_fonts.js";

  export let data: { undertaking: any };
  const { undertaking } = data;

  pdfMake.vfs = pdfFonts.vfs;

  function getDocDefinition() {
    return {
      pageSize: "A4",
      pageMargins: [40, 40, 40, 40],
      content: [
        {
          text: "PROVISIONAL ADMISSION UNDERTAKING",
          style: "header",
          alignment: "center",
        },
        {
          text: "Sardar Vallabhbhai Patel Institute of Technology, Vasad",
          style: "subHeader",
          alignment: "center",
        },
        { text: "", margin: [0, 5, 0, 5] },
        {
          text: `Date: ${undertaking.date}`,
          style: "body",
        },
        {
          text: `Receipt Number: ${undertaking.receiptNumber}`,
          style: "body"
        },
        { text: "", margin: [0, 3, 0, 3] },
        {
          text: "To,",
          style: "body",
        },
        {
          text: "The Principal",
          style: "body",
        },
        {
          text: "Sardar Vallabhbhai Patel Institute of Technology, Vasad",
          style: "body",
        },
        { text: "", margin: [0, 8, 0, 8] },
        {
          text: [
            { text: "I, ", style: "body" },
            { text: undertaking.studentName, style: "bold" },
            // { text: `, and my parent/guardian, `, style: "body" },             
            // { text: undertaking.parentName || "_________________", style: "bold" },
            { text: `, have taken Provisional Admission in the course ${undertaking.courseName}${undertaking.branchName ? " (" + undertaking.branchName + ")" : ""} for the academic year ${undertaking.academicYear} at SVIT.`, style: "body" },
          ],
        },
        { text: "", margin: [0, 5, 0, 5] },
        {
          text: "I hereby declare that I have paid a Token / Provisional Admission Fee of "+`Rs. ${undertaking.provisionalFee.toLocaleString("en-IN")}/- to the institute.`,
          style: "normal",
        },
        { text: "", margin: [0, 5, 0, 5] },
        {
          text: "I clearly understand and agree to the following conditions:",
          style: "body",
        },
        { text: "", margin: [0, 2, 0, 2] },
        {
          ul: [
            "This admission is purely provisional and subject to confirmation through the official admission process / authority.",
            "The paid amount will be adjusted in the tuition fees if my admission is confirmed at SVIT.",
            "The amount will be refundable only if my admission is not confirmed at SVIT through the official admission process.",
            "If I choose to withdraw my admission on my own or take admission in another institute, the paid amount will not be refundable.",
            "I agree to abide by all the rules and regulations of the institute.",
          ],
          style: "bodySmall",
          margin: [0, 0, 0, 5],
        },
        {
          text: "I have read and understood the above conditions and submit this undertaking willingly.",
          style: "body",
        },
        { text: "", margin: [0, 15, 0, 15] },
        {
          table: {
            widths: ["50%", "50%"],
            body: [
              [
                {
                  stack: [
                    { text: `Signature: _________________`, margin: [0, 20, 0, 2] },
                    { text: `Student Name: ${undertaking.studentName}`, margin: [0, 2, 0, 0] },
                    { text: `Contact Number: ${undertaking.studentPhone || "_________________"}`, margin: [0, 0, 0, 2] },
                  ]
                },
                {
                  stack: [
                    { text: `Signature: _________________`, margin: [0, 20, 0, 2] },
                    { text: `Parent/Guardian Name: ${undertaking.parentName || "_________________"}`, margin: [0, 2, 0, 0] },
                    { text: `Contact Number: ${undertaking.parentPhone || "_________________"}`, margin: [0, 0, 0, 2] },
                  ]
                },
              ],
            ],
          },
          layout: "noBorders",
        },
      ],
      styles: {
        header: {
          fontSize: 14,
          bold: true,
          margin: [0, 0, 0, 3],
        },
        subHeader: {
          fontSize: 11,
          bold: true,
          margin: [0, 0, 0, 5],
        },
        body: {
          fontSize: 10,
          lineHeight: 1.2,
        },
        bodySmall: {
          fontSize: 9,
          lineHeight: 1.2,
        },
        smallText: {
          fontSize: 8,
          lineHeight: 1.1,
        },
        bold: {
          bold: true,
        },
      },
    };
  }

  function printPDF() {
    pdfMake.createPdf(getDocDefinition()).print();
  }

  function downloadPDF() {
    pdfMake.createPdf(getDocDefinition()).download(`undertaking_${undertaking.applicationId}.pdf`);
  }
</script>

<svelte:head>
  <title>Print Undertaking - {undertaking.studentName}</title>
</svelte:head>

<div class="container py-4 printable-area">
  <div class="d-flex justify-content-between align-items-center mb-4 no-print">
    <h4>Provisional Admission Undertaking</h4>
    <div>
      <button class="btn btn-primary me-2" onclick={printPDF}>
        <i class="bi bi-printer"></i> Print
      </button>
      <button class="btn btn-success" onclick={downloadPDF}>
        <i class="bi bi-download"></i> Download PDF
      </button>
    </div>
  </div>

  <div class="card">
    <div class="card-body p-3 undertaking-content">
      <div class="text-center mb-2">
        <h5 class="mb-1 fw-bold">PROVISIONAL ADMISSION UNDERTAKING</h5>
        <p class="mb-0 text-muted small">Sardar Vallabhbhai Patel Institute of Technology, Vasad</p>
      </div>

      <div class="mb-2">
        <strong>Date:</strong> {undertaking.date}
      </div>

      <div class="mb-2">
        <p class="mb-0">To,</p>
        <p class="mb-0">The Principal</p>
        <p class="mb-0">Sardar Vallabhbhai Patel Institute of Technology, Vasad</p>
      </div>

      <div class="mb-2">
        <p class="mb-0">
          I, <strong>{undertaking.studentName}</strong>, 
          <!-- and my parent/guardian, 
          <strong>{undertaking.parentName || "_________________"}</strong>,  -->
          have taken Provisional Admission in the course
          <strong>{undertaking.courseName}</strong>{undertaking.branchName ? ` (${undertaking.branchName})` : ""}
          for the academic year <strong>{undertaking.academicYear}</strong> at SVIT.
        </p>
      </div>

      <div class="mb-2">
        <p class="mb-0">
          I hereby declare that I have paid a Token / Provisional Admission Fee of
          <strong>Rs. {undertaking.provisionalFee.toLocaleString("en-IN")}/-</strong>
          to the institute.
        </p>
      </div>

      <div class="mb-2">
        <p class="mb-1"><strong>I clearly understand and agree to the following conditions:</strong></p>
        <ol class="mb-0 small" style="padding-left: 1.2rem;">
          <li>This admission is purely provisional and subject to confirmation through the official admission process / authority.</li>
          <li>The paid amount will be adjusted in the tuition fees if my admission is confirmed at SVIT.</li>
          <li>The amount will be refundable only if my admission is not confirmed at SVIT through the official admission process.</li>
          <li>If I choose to withdraw my admission on my own or take admission in another institute, the paid amount will not be refundable.</li>
          <li>I agree to abide by all the rules and regulations of the institute.</li>
        </ol>
      </div>

      <div class="mb-3">
        <p class="mb-0">I have read and understood the above conditions and submit this undertaking willingly.</p>
      </div>

      <div class="row mt-3">
        <div class="col-6">
          <p class="mb-1"><strong>Student Name:</strong> {undertaking.studentName}</p>
          <p class="mb-0"><strong>Contact:</strong> {undertaking.studentPhone || "_________________"}</p>
        </div>
        <div class="col-6">
          <p class="mb-1"><strong>Parent/Guardian:</strong> {undertaking.parentName || "_________________"}</p>
          <p class="mb-0"><strong>Contact:</strong> {undertaking.parentPhone || "_________________"}</p>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  @media print {
    body {
      background: white !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .no-print,
    nav,
    header,
    aside,
    .sidebar,
    .navbar,
    .container-fluid > *:not(.printable-area),
    .container > *:not(.printable-area) {
      display: none !important;
    }
    .container {
      max-width: 100% !important;
      width: 100% !important;
      padding: 20mm !important;
      margin: 0 !important;
    }
    .printable-area {
      display: block !important;
      width: 100% !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    .printable-area .card {
      border: none !important;
      box-shadow: none !important;
    }
    .printable-area .card-body {
      padding: 0 !important;
    }
    .printable-area .undertaking-content {
      font-size: 10pt;
      line-height: 1.3;
    }
    .printable-area .undertaking-content h5 {
      font-size: 12pt;
    }
    .printable-area .signature-section {
      margin-top: 50px !important;
    }
  }
</style>
