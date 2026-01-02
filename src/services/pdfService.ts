
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ClientInvoice } from '../types';

export const PdfService = {
  generateClientInvoice: (invoice: ClientInvoice) => {
    // eslint-disable-next-line new-cap
    const doc = new jsPDF();

    // --- Header ---
    doc.setFillColor(59, 130, 246); // Blue header
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(26);
    doc.setFont("helvetica", "bold");
    doc.text('INVOICE', 14, 28);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text('Lingland Ltd', 160, 18);
    doc.text('123 Business Park', 160, 23);
    doc.text('London, UK', 160, 28);

    // --- Meta Data ---
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    
    doc.text(`Reference:`, 14, 55);
    doc.setFont("helvetica", "bold");
    doc.text(invoice.reference || invoice.id, 40, 55);
    
    doc.setFont("helvetica", "normal");
    doc.text(`Date Issued:`, 14, 62);
    doc.text(new Date(invoice.issueDate).toLocaleDateString(), 40, 62);

    doc.text(`Bill To:`, 120, 55);
    doc.setFont("helvetica", "bold");
    doc.text(invoice.clientName, 120, 62);

    // --- Table ---
    const tableColumn = ["Description", "Quantity", "Rate", "Total"];
    const tableRows = invoice.items?.map(item => [
      item.description,
      item.units || 1,
      `£${item.rate.toFixed(2)}`,
      `£${item.total.toFixed(2)}`
    ]) || [];

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 75,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 9 },
    });

    // --- Totals ---
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Total Amount: £${invoice.totalAmount.toFixed(2)}`, 140, finalY);

    // --- Footer ---
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150);
    doc.text('Thank you for your business. Please pay within 30 days.', 105, 280, { align: 'center' });

    // Save
    doc.save(`${invoice.reference || 'invoice'}.pdf`);
  }
};
