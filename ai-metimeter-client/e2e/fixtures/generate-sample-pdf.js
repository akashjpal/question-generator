/**
 * One-off generator script for e2e/fixtures/sample-lesson.pdf.
 *
 * Produces a small, valid, text-extractable PDF (plain educational text about
 * photosynthesis) used by the create-assessment PDF-upload / question-generation
 * e2e tests. Text is wrapped to the page width via splitTextToSize so PyMuPDF
 * (used by the question-generator-worker) can cleanly extract full sentences.
 *
 * This script is not part of the test run itself — it documents how the
 * committed fixture was produced. Re-run it only if the fixture needs to change:
 *
 *   node e2e/fixtures/generate-sample-pdf.js
 */
const { jsPDF } = require('jspdf');
const path = require('path');

const doc = new jsPDF({ unit: 'pt', format: 'a4' });

const title = 'Lesson: Photosynthesis';
const paragraphs = [
    'Photosynthesis is the process by which green plants, algae, and some bacteria convert light energy, usually from the sun, into chemical energy stored in glucose.',
    'This process takes place mainly in the chloroplasts of plant cells, where a green pigment called chlorophyll absorbs sunlight. The absorbed light energy drives a chemical reaction that combines carbon dioxide from the air with water absorbed by the roots, producing glucose and releasing oxygen as a byproduct.',
    'The overall reaction can be summarized as: carbon dioxide plus water, in the presence of light energy, yields glucose plus oxygen.',
    'Photosynthesis occurs in two main stages: the light-dependent reactions, which take place in the thylakoid membranes and capture energy from sunlight, and the light-independent reactions, also called the Calvin cycle, which take place in the stroma and use that captured energy to build glucose molecules.',
    'This process is essential for nearly all life on Earth. It produces the oxygen that most organisms need to breathe, and it forms the base of the food chain by converting inorganic carbon into organic compounds that other organisms can consume for energy.',
];

const marginLeft = 56;
const marginTop = 72;
const maxWidth = 483; // A4 width (595pt) minus left/right margins
const lineHeight = 16;
let cursorY = marginTop;

doc.setFont('helvetica', 'bold');
doc.setFontSize(18);
doc.text(title, marginLeft, cursorY);
cursorY += lineHeight * 2;

doc.setFont('helvetica', 'normal');
doc.setFontSize(12);

for (const paragraph of paragraphs) {
    const lines = doc.splitTextToSize(paragraph, maxWidth);
    for (const line of lines) {
        if (cursorY > 780) {
            doc.addPage();
            cursorY = marginTop;
        }
        doc.text(line, marginLeft, cursorY);
        cursorY += lineHeight;
    }
    cursorY += lineHeight * 0.5;
}

const outPath = path.join(__dirname, 'sample-lesson.pdf');
doc.save(outPath, { returnPromise: false });

console.log(`Generated ${outPath}`);
