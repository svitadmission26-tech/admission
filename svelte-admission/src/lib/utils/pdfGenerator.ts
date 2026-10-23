import * as pdfMakeLib from "pdfmake/build/pdfmake";
import * as pdfFontsLib from "pdfmake/build/vfs_fonts";

const pdfMake: any = (pdfMakeLib as any).default || pdfMakeLib;
const pdfFonts: any = (pdfFontsLib as any).default || pdfFontsLib;

if (pdfMake) {
    pdfMake.vfs = pdfFonts?.pdfMake?.vfs || pdfFonts?.vfs || pdfFonts;
}

export interface ReceiptData {
  receiptNumber: string;
  date: string;
  studentName: string;
  email: string;
  enrollmentNumber?: string;
  admissionNumber?: string;
  provisionalAdmissionId?: string;
  courseName: string;
  branchName?: string;
  academicYear?: string;
  semester?: string;
  paymentType: string;
  isProvisional?: boolean;
  transactionId?: string;
  amount: number;
  totalStructureFee: number;
  feeBreakdown?: Array<{
    name?: string;
    items?: Array<{ name: string; amount: number }>;
  }>;
  paymentModes?: Array<{
    mode: string;
    amount: number;
    ref?: string;
    date?: string;
    bankName?: string;
  }>;
  university: {
    name: string;
    logoUrl?: string;
    address?: string;
    contactEmail?: string;
  };
  collegeAlias?: string;
  admissionType?: string; // e.g. MQ/NRI, ACPC
}

function formatCurrency(amount: any): string {
  if (typeof amount === 'number') {
    return amount.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (!amount) return "0.00";
  const clean = String(amount).replace(/[^0-9.-]+/g, '');
  const parsed = parseFloat(clean);
  if (isNaN(parsed)) return "0.00";
  return parsed.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function numberToWords(num: number): string {
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const val = Math.floor(num);
  if (val === 0) return 'Zero ';
  
  let numStr = val.toString();
  if (numStr.length > 9) return 'overflow';
  const n: any = ('000000000' + numStr).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return ''; 
  let str = '';
  str += (Number(n[1]) != 0) ? (a[Number(n[1])] || b[Number(n[1][0])] + ' ' + a[Number(n[1][1])]) + 'Crore ' : '';
  str += (Number(n[2]) != 0) ? (a[Number(n[2])] || b[Number(n[2][0])] + ' ' + a[Number(n[2][1])]) + 'Lakh ' : '';
  str += (Number(n[3]) != 0) ? (a[Number(n[3])] || b[Number(n[3][0])] + ' ' + a[Number(n[3][1])]) + 'Thousand ' : '';
  str += (Number(n[4]) != 0) ? (a[Number(n[4])] || b[Number(n[4][0])] + ' ' + a[Number(n[4][1])]) + 'Hundred ' : '';
  str += (Number(n[5]) != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[Number(n[5][0])] + ' ' + a[Number(n[5][1])]) + 'Only' : 'Only';
  return str.trim();
}

/**
 * 1. PROVISIONAL FORMAT
 */
function createProvisionalReceiptContent(data: ReceiptData, copyLabel: string): any[] {
    const content: any[] = [];
    
    // Horizontal Header: Logo (left), Centered Info (middle), Copy Label (right)
    const headerRow: any[] = [];
    
    // Left column: Logo
    if (data.university.logoUrl) {
        headerRow.push({
            width: 80,
            image: data.university.logoUrl,
            fit: [60, 60],
            alignment: "left",
            margin: [0, 0, 0, 0]
        });
    } else {
        headerRow.push({ width: 80, text: "" });
    }

    // Middle column: Centered University Info
    headerRow.push({
        width: "*",
        stack: [
                { text: data.university.name.toUpperCase(), fontSize: 12, bold: true, alignment: "center", margin: [0, 0, 0, 1] },
            { text: data.university.address || "Vasad", fontSize: 10, alignment: "center" },
            { text: data.university.contactEmail || "admission@svitvasad.ac.in", fontSize: 10, alignment: "center" },
        ],
        margin: [0, 5, 0, 0] // Vertical alignment adjustment
    });

    // Right column: Copy Label (Right Aligned)
    headerRow.push({ 
        width: 80, 
        text: `${copyLabel} COPY`, 
        fontSize: 10, 
        bold: true, 
        alignment: "right",
        margin: [0, 5, 0, 0]
    });

    content.push({
        columns: headerRow,
        margin: [0, 0, 0, 15]
    });
    content.push({ text: "FEE RECEIPT", fontSize: 16, bold: true, alignment: "center", margin: [0, 0, 0, 15] });
    content.push({ columns: [ { text: `Receipt No: ${data.receiptNumber}`, bold: true, fontSize: 11 }, { text: `Date: ${formatDate(data.date)}`, alignment: "right", fontSize: 11 } ], margin: [0, 0, 0, 10] });
    content.push({
        columns: [
            { width: "55%", stack: [ { text: "Student Details", fontSize: 11, bold: true, decoration: "underline", margin: [0, 0, 0, 5] }, { text: `Name: ${data.studentName.toUpperCase()}`, fontSize: 10 }, { text: `Email: ${data.email}`, fontSize: 10 } ] },
            { width: "45%", stack: [ { text: "Admission Details", fontSize: 11, bold: true, decoration: "underline", margin: [0, 0, 0, 5] }, { text: `Prov Adm ID: ${data.admissionNumber || data.provisionalAdmissionId || "-"}`, fontSize: 10 }, { text: `Course: ${data.courseName}`, fontSize: 10 }, { text: `Branch: ${data.branchName || "-"}`, fontSize: 10 } ] }
        ],
        margin: [0, 0, 0, 15]
    });
    content.push({
        table: {
            widths: ["*", 100],
            body: [
                [ { text: "Description", bold: true, fillColor: "#f3f3f3", fontSize: 11 }, { text: "Amount", bold: true, fillColor: "#f3f3f3", alignment: "right", fontSize: 11 } ],
                [ { stack: [ { text: "PROVISIONAL FEE", bold: true, margin: [0, 5, 0, 2] }, { text: `Ref: ${data.transactionId || "-"}`, fontSize: 8, color: "#444" } ] }, { text: `Rs. ${formatCurrency(data.amount)}`, alignment: "right", margin: [0, 10, 0, 0], bold: true } ]
            ]
        },
        margin: [0, 0, 0, 20]
    });
    content.push({ columns: [ { text: data.university.name + ", Vasad", fontSize: 9, italics: true, width: "*" }, { stack: [ { text: "Signature: ________________", alignment: "right" } ], width: 150 } ], margin: [0, 10, 0, 0] });
    return content;
}

/**
 * 2. ORIGINAL SIMPLE FORMAT
 */
function createSimpleReceiptContent(data: ReceiptData, copyLabel: string): any[] {
    const content: any[] = [];
    
    // Horizontal Header: Logo (left), Centered Info (middle), Placeholder (right) to balance
    const headerRow: any[] = [];
    
    // Left column: Logo
    if (data.university.logoUrl) {
        headerRow.push({
            width: 80,
            image: data.university.logoUrl,
            fit: [60, 60],
            alignment: "left",
            margin: [0, 0, 0, 0]
        });
    } else {
        headerRow.push({ width: 80, text: "" });
    }

    // Middle column: Centered University Info
    headerRow.push({
        width: "*",
        stack: [
                      { text: data.university.name.toUpperCase(), fontSize: 12, bold: true, alignment: "center" },
                      { text: data.university.address || "Vasad", fontSize: 10, alignment: "center" }
                  ],
                  margin: [0, 2, 0, 0]    });

    // Right column: Placeholder
    headerRow.push({ width: 80, text: "" });

    content.push({
        columns: headerRow,
        margin: [0, 0, 0, 15]
    });

    content.push({ text: "FEE RECEIPT", fontSize: 16, bold: true, alignment: "center", margin: [0, 0, 0, 20] });
    content.push({
      columns: [
        { width: "*", stack: [ { text: `Receipt No: ${data.receiptNumber}`, bold: true }, { text: `Date: ${formatDate(data.date)}` } ] },
        { width: "auto", stack: [ { text: `Copy: ${copyLabel}`, italics: true }, { text: `ID: ${data.enrollmentNumber || data.admissionNumber || "-"}` } ], alignment: "right" },
      ],
      margin: [0, 0, 0, 20],
    });
    content.push({ text: [ { text: "Received with thanks from: ", bold: true }, data.studentName.toUpperCase() ], margin: [0, 0, 0, 5] });
    content.push({ text: [{ text: "Course: ", bold: true }, data.courseName], margin: [0, 0, 0, 5] });
    content.push({ text: [{ text: "Payment Type: ", bold: true }, data.paymentType.replace('_', ' ').toUpperCase()], margin: [0, 0, 0, 20] });
    content.push({
      table: {
        widths: ["*", "auto"],
        body: [
          [ { text: "Description", bold: true, fillColor: "#eeeeee" }, { text: "Amount (INR)", bold: true, fillColor: "#eeeeee" } ],
          [ { text: `${data.paymentType.replace('_', ' ').toUpperCase()} Payment` }, { text: formatCurrency(data.amount), alignment: "right" } ],
          [ { text: "Total Amount Paid", bold: true }, { text: formatCurrency(data.amount), bold: true, alignment: "right" } ],
        ],
      },
      margin: [0, 0, 0, 20],
    });
    const totalVal = typeof data.amount === 'number' ? data.amount : parseFloat(String(data.amount).replace(/[^0-9.-]+/g, '')) || 0;
    content.push({ text: [ { text: 'Amount in words: ', bold: true }, numberToWords(totalVal) + ' Only' ], margin: [0, 0, 0, 30] });
    content.push({ text: "This is a computer-generated receipt and does not require a signature.", fontSize: 8, alignment: "center", margin: [0, 30, 0, 0] });
    return content;
}

/**
 * 3. DETAILED REDESIGN
 */
function createDetailedReceiptContent(data: ReceiptData, copyLabel: string): any[] {
  const content: any[] = [];
  
  // Horizontal Header: Logo (left), Centered Info (middle), Placeholder (right) to balance
  const headerRow: any[] = [];
  
  // Left column: Logo
  if (data.university.logoUrl) {
      headerRow.push({
          width: 80,
          image: data.university.logoUrl,
          fit: [60, 60],
          alignment: "left",
          margin: [0, 0, 0, 0]
      });
  } else {
      headerRow.push({ width: 80, text: "" });
  }

  // Middle column: Centered University Info
  const universityName = data.university.name.toUpperCase();
  const nameParts = universityName.split('(');
  const universityTitleStack: any[] = [];
  
  if (nameParts.length > 1) {
      universityTitleStack.push({ text: nameParts[0].trim(), fontSize: 12, bold: true, alignment: "center" });
      universityTitleStack.push({ text: '(' + nameParts.slice(1).join('(').trim(), fontSize: 12, bold: true, alignment: "center", margin: [0, 0, 0, 1] });
  } else {
      universityTitleStack.push({ text: universityName, fontSize: 12, bold: true, alignment: "center", margin: [0, 0, 0, 1] });
  }

  headerRow.push({
      width: "*",
      stack: [
          ...universityTitleStack,
          { text: data.university.address || "Vasad", fontSize: 10, alignment: "center" },
          { text: `Academic Year: ${data.academicYear || "-"}`, fontSize: 11, bold: true, alignment: "center", margin: [0, 2, 0, 0] },
      ],
      margin: [0, 2, 0, 0]
  });

  // Right column: Placeholder for balancing to keep middle text truly centered on page
  headerRow.push({ width: 80, text: "" });

  content.push({
      columns: headerRow,
      margin: [0, 0, 0, 5]
  });
  content.push({ columns: [ { text: `College ID: ${data.enrollmentNumber || data.admissionNumber || "-"}`, fontSize: 10 }, { text: `Receipt Number: ${data.receiptNumber || "-"}`, fontSize: 10, alignment: "right" } ] });
  content.push({ columns: [ { text: `Branch Name: ${data.branchName || "-"}`, fontSize: 10 }, { text: `Date: ${formatDate(data.date)}`, fontSize: 10, alignment: "right" } ], margin: [0, 0, 0, 2] });
  content.push({ text: "Received From,", fontSize: 10, margin: [0, 2, 0, 0] });
  content.push({ text: data.studentName.toUpperCase(), fontSize: 11, bold: true, margin: [0, 1, 0, 2] });
  const article = data.semester && data.semester.includes('Academic') ? 'an' : 'a';
  content.push({ text: [ "The Following amount as Fees for the ", { text: data.courseName || "Course", bold: true }, ` for ${article} `, { text: data.semester || "SEMESTER", bold: true }, " ", { text: data.academicYear || "", bold: true } ], fontSize: 10, margin: [0, 0, 0, 2] });
  const tableBody: any[][] = [ [ { text: "Sr.", fontSize: 9, bold: true, fillColor: "#eeeeee", alignment: "center" }, { text: "Particulars", fontSize: 9, bold: true, fillColor: "#eeeeee" }, { text: "Fees in Rs.", fontSize: 9, bold: true, fillColor: "#eeeeee", alignment: "right" } ] ];
  if (data.feeBreakdown && data.feeBreakdown.length > 0) {
    data.feeBreakdown.forEach((section) => {
      if (section.name) { tableBody.push([ { text: "" }, { text: section.name, fontSize: 9, bold: true }, { text: "" } ]); }
      let sectionSubtotal = 0;
      (section.items || []).forEach((item, idx) => {
        const itemAmount = typeof item.amount === 'number' ? item.amount : parseFloat(String(item.amount).replace(/[^0-9.-]+/g, '')) || 0;
        sectionSubtotal += itemAmount;
        tableBody.push([ { text: idx + 1, alignment: "center", fontSize: 9 }, { text: item.name, fontSize: 9 }, { text: formatCurrency(item.amount), alignment: "right", fontSize: 9 } ]);
      });
      tableBody.push([ { text: "" }, { text: "SubTotal", fontSize: 9, bold: true, alignment: "right" }, { text: formatCurrency(sectionSubtotal), fontSize: 9, bold: true, alignment: "right" } ]);
    });
  } else { tableBody.push([ { text: "1", alignment: "center", fontSize: 9 }, { text: data.paymentType.replace('_', ' ').toUpperCase(), fontSize: 9 }, { text: formatCurrency(data.amount), alignment: "right", fontSize: 9 } ]); }
  tableBody.push([ { text: "" }, { text: "Grand Total in Rs.", fontSize: 10, bold: true, alignment: "right" }, { text: formatCurrency(data.amount), fontSize: 10, bold: true, alignment: "right" } ]);
  content.push({ table: { widths: [30, "*", 100], body: tableBody }, margin: [0, 0, 0, 0] });
  const totalVal = typeof data.amount === 'number' ? data.amount : parseFloat(String(data.amount).replace(/[^0-9.-]+/g, '')) || 0;
  content.push({ text: `In Words: ${numberToWords(totalVal)} Only`, fontSize: 10, bold: true, margin: [0, 2, 0, 2] });
  const modes = data.paymentModes || [];
  const cash = modes.find(m => m.mode.toLowerCase() === 'cash');
  const cheque = modes.find(m => m.mode.toLowerCase() === 'cheque' || m.mode.toLowerCase() === 'dd');
  const online = modes.find(m => m.mode.toLowerCase() === 'online');
  const advance = modes.find(m => m.mode.toLowerCase() === 'advance');
  const freeship = modes.find(m => m.mode.toLowerCase() === 'freeship');
  const acpc = modes.find(m => m.mode.toLowerCase() === 'acpc');
  content.push({
    table: {
      widths: ["*", "*", "*", "*"],
      body: [
        [ { text: "CASH", fontSize: 9, bold: true, fillColor: "#f9f9f9" }, { text: `Amount: ${cash ? formatCurrency(cash.amount) : "0.00"}`, fontSize: 8 }, { text: `ADVANCE Amount: ${advance ? formatCurrency(advance.amount) : "0.00"}`, fontSize: 8 }, { text: `Freeship Amount: ${freeship ? formatCurrency(freeship.amount) : "0.00"}`, fontSize: 8 } ],
        [ { text: "DD/Cheque", fontSize: 9, bold: true, fillColor: "#f9f9f9" }, { text: `Amount: ${cheque ? formatCurrency(cheque.amount) : "0.00"}`, fontSize: 8 }, { text: `Bank Name: ${cheque?.bankName || "-"}`, fontSize: 8 }, { text: `Ref.: ${cheque?.ref || "-"} Date: ${cheque?.date ? formatDate(cheque.date) : "-"}`, fontSize: 8 } ],
        [ { text: "Online", fontSize: 9, bold: true, fillColor: "#f9f9f9" }, { text: `Amount: ${online ? formatCurrency(online.amount) : "0.00"}`, fontSize: 8 }, { text: `Reference Number: ${online?.ref || "-"}`, fontSize: 8, colSpan: 2 }, {} ],
        [ { text: "ACPC", fontSize: 9, bold: true, fillColor: "#f9f9f9" }, { text: `Amount: ${acpc ? formatCurrency(acpc.amount) : "0.00"}`, fontSize: 8, colSpan: 3 }, {}, {} ],
      ]
    },
    margin: [0, 0, 0, 2]
  });
  content.push({
    margin: [0, 15, 0, 0],
    stack: [
      {
        columns: [
          { width: "*", text: "" },
          {
            width: 150,
            stack: [
              { canvas: [{ type: 'rect', x: 42, y: 0, w: 65, h: 65, lineColor: 'black', lineWidth: 1 }], margin: [0, 0, 0, 5] },
              { text: "Authorized Signature", fontSize: 10, bold: true, alignment: "center" },
              { text: `${data.collegeAlias || "SVIT"}, Vasad`, fontSize: 10, alignment: "center" }
            ]
          }
        ],
        margin: [0, 0, 0, 10]
      },
      { 
          text: [ 
              { text: "Note:: ", bold: true }, `In addition to above tuition fees, candidate shall have to pay the fees of course/institute fixed by the Fees Regulatory Committee as and when declared from the academic year ${data.academicYear || "-"}\n`, 
              { text: "Note:: ", bold: true }, "Rs.5,000/- refundable deposit after Final Semester clear and verification of original Marksheet" 
          ], 
          fontSize: 8, 
          italics: true
      }
    ]
  });
  return content;
}

/**
 * Helper to convert an image URL to a DataURL
 */
async function imageToDataURL(url: string): Promise<string | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch image');
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('[pdfGenerator] Error converting image to DataURL:', error);
        return null;
    }
}

async function buildReceiptDocument(data: ReceiptData, filename?: string): Promise<void> {
  // 1. Clone data
  const docData = JSON.parse(JSON.stringify(data));

  // 2. Pre-load Logo if URL is provided
  if (docData.university.logoUrl && docData.university.logoUrl.startsWith('http')) {
      const dataUrl = await imageToDataURL(docData.university.logoUrl);
      docData.university.logoUrl = dataUrl || undefined;
  }

  // 3. Build Content
  let content: any[] = [];
  if (docData.paymentType === 'tuition_fee') {
      content = createDetailedReceiptContent(docData, "ORIGINAL");
  } else if (docData.isProvisional) {
      content = [
          ...createProvisionalReceiptContent(docData, "STUDENT"),
          {
              columns: [
                  { width: "*", canvas: [{ type: 'line', x1: 0, y1: 10, x2: 210, y2: 10, lineWidth: 1, dash: { length: 2, space: 2 }, lineColor: '#aaa' }] },
                  { width: "auto", text: "✂ Cut Here", fontSize: 10, italics: true, color: "#888", margin: [10, 0, 10, 0] },
                  { width: "*", canvas: [{ type: 'line', x1: 0, y1: 10, x2: 210, y2: 10, lineWidth: 1, dash: { length: 2, space: 2 }, lineColor: '#aaa' }] },
              ],
              margin: [0, 30, 0, 30]
          },
          ...createProvisionalReceiptContent(docData, "OFFICE")
      ];
  } else {
      content = createSimpleReceiptContent(docData, "ORIGINAL");
  }

  const docDefinition: any = {
    pageSize: "A4",
    pageMargins: [30, 30, 30, 30],
    content: content,
  };

  // 4. Use Original pdfmake functions
  const pdfDoc = pdfMake.createPdf(docDefinition);
  if (filename) {
    pdfDoc.download(filename);
  } else {
    pdfDoc.print();
  }
}

/**
 * 4. ADMISSION SLIP FORMAT (A5)
 */
function createAdmissionSlipContent(data: ReceiptData): any[] {
    const content: any[] = [];
    
    // Header
    const headerRow: any[] = [];
    if (data.university.logoUrl) {
        headerRow.push({
            width: 70,
            image: data.university.logoUrl,
            fit: [50, 50],
            alignment: "left"
        });
    } else {
        headerRow.push({ width: 70, text: "" });
    }

    headerRow.push({
        width: "*",
        stack: [
            { text: data.university.name.toUpperCase(), fontSize: 12, bold: true, alignment: "center" },
            { text: data.university.address || "Vasad", fontSize: 9, alignment: "center", margin: [0, 2, 0, 0] }
        ],
        margin: [0, 2, 0, 0]
    });

    headerRow.push({ width: 70, text: "" });

    content.push({
        columns: headerRow,
        margin: [0, 0, 0, 10]
    });

    content.push({
        text: "PROVISIONAL ADMISSION SLIP",
        fontSize: 12,
        bold: true,
        alignment: "center",
        color: "white",
        background: "#333",
        margin: [0, 0, 0, 12]
    });

    // Student and Admission Number
    content.push({
        columns: [
            {
                width: "*",
                stack: [
                    { text: "Student Full Name", fontSize: 8, color: "#666", margin: [0, 0, 0, 2] },
                    { text: data.studentName.toUpperCase(), fontSize: 11, bold: true }
                ]
            },
            {
                width: "auto",
                stack: [
                    { text: "Admission Number", fontSize: 8, color: "#666", alignment: "right", margin: [0, 0, 0, 2] },
                    { text: data.admissionNumber || "PENDING", fontSize: 11, bold: true, color: "#0d6efd", alignment: "right" }
                ]
            }
        ],
        margin: [0, 0, 0, 10]
    });

    // Info Grid
    const infoGridBody = [
        [
            { stack: [{ text: "COURSE", fontSize: 7, color: "#666" }, { text: data.courseName, fontSize: 9.5, bold: true }] },
            { stack: [{ text: "BRANCH", fontSize: 7, color: "#666" }, { text: data.branchName || "General / N/A", fontSize: 9.5, bold: true }] },
            { stack: [{ text: "ACADEMIC YEAR", fontSize: 7, color: "#666" }, { text: data.academicYear || "-", fontSize: 9.5, bold: true }] }
        ],
        [
            { stack: [{ text: "APPLICATION TYPE", fontSize: 7, color: "#666" }, { text: data.admissionType || data.paymentType || "-", fontSize: 9.5, bold: true }] },
            { stack: [{ text: "ADMISSION MODE", fontSize: 7, color: "#666" }, { text: "Regular", fontSize: 9.5, bold: true }] },
            { stack: [{ text: "DATE OF ISSUE", fontSize: 7, color: "#666" }, { text: formatDate(new Date().toISOString()), fontSize: 9.5, bold: true }] }
        ]
    ];

    content.push({
        table: {
            widths: ["*", "*", "*"],
            body: infoGridBody
        },
        layout: "noBorders",
        margin: [0, 0, 0, 10]
    });

    content.push({
        stack: [
            { text: `Status: APPROVED`, fontSize: 10, bold: true, color: "#198754", alignment: "center" }
        ],
        fillColor: "#f8f9fa",
        margin: [0, 0, 0, 12],
        padding: [5, 5, 5, 5]
    });

    // Footer Signatures
    content.push({
        columns: [          
            { width: "*", text: "" },
            {
                width: 150,
                stack: [
                    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 0.5 }], margin: [0, 10, 0, 3] },
                    { text: "Authorized Signature", fontSize: 8, alignment: "center" },
                    { text: `${data.collegeAlias || "SVIT"}, Vasad`, fontSize: 7, color: "#666", alignment: "center" }
                ]
            }
        ],
        margin: [0, 60, 0, 4]
    });

    content.push({
        text: "* This is a computer-generated admission slip. Please present this slip for fee payment and enrollment processes.",
        fontSize: 7,
        italics: true,
        color: "#666",
        margin: [0, 6, 0, 0]
    });

    return content;
}

async function buildAdmissionSlipDocument(data: ReceiptData, filename?: string): Promise<void> {
  const docData = JSON.parse(JSON.stringify(data));
  if (docData.university.logoUrl && docData.university.logoUrl.startsWith('http')) {
      const dataUrl = await imageToDataURL(docData.university.logoUrl);
      docData.university.logoUrl = dataUrl || undefined;
  }

  const docDefinition: any = {
    pageSize: "A5",
    pageOrientation: "landscape",
    pageMargins: [25, 20, 25, 20],
    content: createAdmissionSlipContent(docData),
  };

  const pdfDoc = pdfMake.createPdf(docDefinition);
  if (filename) {
    pdfDoc.download(filename);
  } else {
    pdfDoc.print();
  }
}

export async function generateAdmissionSlipPDF(data: ReceiptData): Promise<void> {
  await buildAdmissionSlipDocument(data);
}

export async function downloadAdmissionSlipPDF(data: ReceiptData): Promise<void> {
  const filename = `AdmissionSlip_${data.admissionNumber || "Draft"}.pdf`;
  await buildAdmissionSlipDocument(data, filename);
}

export async function generateReceiptPDF(data: ReceiptData): Promise<void> {
  await buildReceiptDocument(data);
}

export async function downloadReceiptPDF(data: ReceiptData): Promise<void> {
  const filename = `Receipt_${data.receiptNumber || "Draft"}.pdf`;
  await buildReceiptDocument(data, filename);
}
