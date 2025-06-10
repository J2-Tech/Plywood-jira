// Legacy notes format conversion utility
// This handles migration from old EditorJS format to Tiptap HTML

export function convertLegacyNotesToHTML(notesData) {
    try {
        // If it's already HTML, return as is
        if (typeof notesData === 'string' && notesData.includes('<')) {
            return notesData;
        }
        
        // If it's JSON from old format, try to parse and convert
        if (typeof notesData === 'string' && (notesData.startsWith('{') || notesData.startsWith('['))) {
            const parsed = JSON.parse(notesData);
            
            // Handle EditorJS format
            if (parsed.blocks && Array.isArray(parsed.blocks)) {
                return parsed.blocks.map(block => {
                    switch (block.type) {
                        case 'paragraph':
                            return `<p>${block.data.text || ''}</p>`;
                        case 'header':
                            const level = block.data.level || 1;
                            return `<h${level}>${block.data.text || ''}</h${level}>`;
                        case 'list':
                            const listType = block.data.style === 'ordered' ? 'ol' : 'ul';
                            const items = block.data.items.map(item => `<li>${item}</li>`).join('');
                            return `<${listType}>${items}</${listType}>`;
                        case 'quote':
                            return `<blockquote><p>${block.data.text || ''}</p></blockquote>`;
                        case 'code':
                            return `<pre><code>${block.data.code || ''}</code></pre>`;
                        default:
                            return `<p>${block.data?.text || JSON.stringify(block.data)}</p>`;
                    }
                }).join('');
            }
            
            // Handle simple object with text
            if (parsed.text) {
                return `<p>${parsed.text}</p>`;
            }
            
            // Fallback: convert to string
            return `<p>${JSON.stringify(parsed)}</p>`;
        }
        
        // Handle plain text - preserve line breaks
        if (typeof notesData === 'string') {
            const paragraphs = notesData.split('\n').filter(line => line.trim());
            if (paragraphs.length === 0) return '<p></p>';
            return paragraphs.map(p => `<p>${p.trim()}</p>`).join('');
        }
        
        // Default fallback
        return '<p></p>';
    } catch (e) {
        console.warn('Failed to convert legacy notes:', e);
        return `<p>${notesData || ''}</p>`;
    }
}

console.info('Legacy notes converter loaded - use convertLegacyNotesToHTML() for migration');
