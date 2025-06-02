const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, UnderlineType } = require('docx');

// Read the markdown content
const markdownContent = fs.readFileSync('Taotter_Platform_Features_Client_Presentation.md', 'utf8');

// Function to convert markdown-like content to DOCX
function createDocxFromContent(content) {
  const lines = content.split('\n');
  const docElements = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line === '') {
      // Add spacing
      docElements.push(new Paragraph({ children: [] }));
      continue;
    }

    if (line.startsWith('# ')) {
      // Main title
      const text = line.replace('# ', '');
      docElements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: text,
              bold: true,
              size: 32,
              color: "1f4e79"
            })
          ],
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 }
        })
      );
    } else if (line.startsWith('## ')) {
      // Section headers
      const text = line.replace('## ', '').replace(/🚀|🎯|🛠️|🔧|📊|🎨|🔮|📈|🛡️|🌟|💼|📞/g, '');
      docElements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: text.trim(),
              bold: true,
              size: 24,
              color: "2e75b6"
            })
          ],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 }
        })
      );
    } else if (line.startsWith('### ')) {
      // Subsection headers
      const text = line.replace('### ', '');
      docElements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: text,
              bold: true,
              size: 18,
              color: "3d85c6"
            })
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 150 }
        })
      );
    } else if (line.startsWith('#### ')) {
      // Sub-subsection headers
      const text = line.replace('#### ', '');
      docElements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: text,
              bold: true,
              size: 14,
              color: "4a90a4"
            })
          ],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 }
        })
      );
    } else if (line.startsWith('- **')) {
      // Bold bullet points
      const match = line.match(/- \*\*(.*?)\*\*:\s*(.*)/);
      if (match) {
        docElements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `• ${match[1]}: `,
                bold: true,
                size: 22
              }),
              new TextRun({
                text: match[2],
                size: 22
              })
            ],
            spacing: { after: 100 },
            indent: { left: 360 }
          })
        );
      }
    } else if (line.startsWith('- ')) {
      // Regular bullet points
      const text = line.replace('- ', '');
      docElements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `• ${text}`,
              size: 22
            })
          ],
          spacing: { after: 100 },
          indent: { left: 360 }
        })
      );
    } else if (line.startsWith('_') && line.endsWith('_')) {
      // Italic text
      const text = line.replace(/_/g, '');
      docElements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: text,
              italics: true,
              size: 22
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 }
        })
      );
    } else if (line.includes('**')) {
      // Text with bold sections
      const parts = line.split('**');
      const children = [];
      for (let j = 0; j < parts.length; j++) {
        if (j % 2 === 0) {
          // Regular text
          if (parts[j].trim()) {
            children.push(new TextRun({ text: parts[j], size: 22 }));
          }
        } else {
          // Bold text
          children.push(new TextRun({ text: parts[j], bold: true, size: 22 }));
        }
      }
      docElements.push(
        new Paragraph({
          children: children,
          spacing: { after: 100 }
        })
      );
    } else if (line.startsWith('1. ') || line.match(/^\d+\. /)) {
      // Numbered lists
      const text = line.replace(/^\d+\. /, '');
      docElements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: text,
              size: 22
            })
          ],
          numbering: {
            reference: "default-numbering",
            level: 0
          },
          spacing: { after: 100 }
        })
      );
    } else if (line === '---') {
      // Horizontal rule - add spacing
      docElements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "_______________________________________________",
              color: "cccccc"
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 200 }
        })
      );
    } else if (line.trim() && !line.startsWith('```')) {
      // Regular paragraph text
      docElements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line,
              size: 22
            })
          ],
          spacing: { after: 100 }
        })
      );
    }
  }

  return docElements;
}

// Create the document
const doc = new Document({
  creator: "Taotter Team",
  title: "Taotter Platform - Feature Overview",
  description: "Comprehensive feature overview for client presentation",
  styles: {
    paragraphStyles: [
      {
        id: "default",
        name: "Default",
        basedOn: "Normal",
        next: "default",
        run: {
          font: "Calibri",
          size: 22
        },
        paragraph: {
          spacing: {
            after: 120
          }
        }
      }
    ]
  },
  numbering: {
    config: [
      {
        reference: "default-numbering",
        levels: [
          {
            level: 0,
            format: "decimal",
            text: "%1.",
            alignment: AlignmentType.START,
            style: {
              paragraph: {
                indent: { left: 360, hanging: 260 }
              }
            }
          }
        ]
      }
    ]
  },
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: 1440,   // 1 inch
            right: 1440, // 1 inch
            bottom: 1440, // 1 inch
            left: 1440   // 1 inch
          }
        }
      },
      children: createDocxFromContent(markdownContent)
    }
  ]
});

// Generate and save the document
async function generateDocument() {
  try {
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync('Taotter_Platform_Features_Client_Presentation.docx', buffer);
    console.log('✅ DOCX document created successfully: Taotter_Platform_Features_Client_Presentation.docx');
    
    // Clean up the conversion script
    fs.unlinkSync('convert-to-docx.js');
    console.log('✅ Conversion script cleaned up');
  } catch (error) {
    console.error('❌ Error creating DOCX document:', error);
  }
}

generateDocument();
