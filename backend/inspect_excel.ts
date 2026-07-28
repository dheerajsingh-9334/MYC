import * as xlsx from 'xlsx';

const workbook = xlsx.readFile('/home/dheerajsingh/Desktop/MYC/Development Copy of MyC Client Status.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

console.log(data[0]); // Headers
console.log(data[1]); // First row of data
