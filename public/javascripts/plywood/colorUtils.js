/**
 * Calculate the luminance of a color
 * @param {string} color - Color in hex format (e.g., "#FF0000")
 * @returns {number} - Luminance value between 0 and 1
 */
export function calculateLuminance(color) {
    // Remove the hash if present
    const hex = color.replace('#', '');
    
    // Parse RGB values
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    
    // Apply gamma correction
    const sR = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    const sG = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    const sB = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
    
    // Calculate luminance
    return 0.2126 * sR + 0.7152 * sG + 0.0722 * sB;
}

/**
 * Calculate contrast ratio between two colors
 * @param {number} luminance1 - Luminance of first color
 * @param {number} luminance2 - Luminance of second color
 * @returns {number} - Contrast ratio
 */
export function calculateContrastRatio(luminance1, luminance2) {
    const lighter = Math.max(luminance1, luminance2);
    const darker = Math.min(luminance1, luminance2);
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Determine the best text color (white or black) for a given background color
 * @param {string} backgroundColor - Background color in hex format
 * @returns {string} - Either "#FFFFFF" for white text or "#000000" for black text
 */
export function getContrastingTextColor(backgroundColor) {
    if (!backgroundColor) return '#000000';
    
    // Handle various color formats
    let hexColor = backgroundColor;
    
    // Convert RGB to hex if needed
    if (backgroundColor.startsWith('rgb')) {
        const rgbMatch = backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
            const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
            const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
            hexColor = `#${r}${g}${b}`;
        }
    }
    
    // Convert HSL to hex if needed (basic conversion)
    if (backgroundColor.startsWith('hsl')) {
        // For HSL, we'll use a simplified approach
        // In practice, you might want to implement full HSL to RGB conversion
        const hslMatch = backgroundColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
        if (hslMatch) {
            const lightness = parseInt(hslMatch[3]);
            // Simple threshold based on lightness
            return lightness > 50 ? '#000000' : '#FFFFFF';
        }
    }
    
    // Ensure we have a valid hex color
    if (!hexColor.startsWith('#') || hexColor.length !== 7) {
        return '#000000'; // Default to black for invalid colors
    }
    
    try {
        const backgroundLuminance = calculateLuminance(hexColor);
        const whiteLuminance = 1.0; // White luminance
        const blackLuminance = 0.0; // Black luminance
        
        const contrastWithWhite = calculateContrastRatio(backgroundLuminance, whiteLuminance);
        const contrastWithBlack = calculateContrastRatio(backgroundLuminance, blackLuminance);
        
        // Choose the color with better contrast (WCAG recommends minimum 4.5:1 for normal text)
        return contrastWithWhite > contrastWithBlack ? '#FFFFFF' : '#000000';
    } catch (error) {
        console.warn('Error calculating contrasting text color for', backgroundColor, error);
        return '#000000'; // Default to black on error
    }
}

/**
 * Check if a color meets WCAG contrast requirements
 * @param {string} backgroundColor - Background color
 * @param {string} textColor - Text color
 * @param {string} level - WCAG level ('AA' or 'AAA')
 * @returns {boolean} - Whether the contrast meets the requirements
 */
export function meetsContrastRequirements(backgroundColor, textColor, level = 'AA') {
    try {
        const bgLuminance = calculateLuminance(backgroundColor);
        const textLuminance = calculateLuminance(textColor);
        const contrastRatio = calculateContrastRatio(bgLuminance, textLuminance);
        
        const requiredRatio = level === 'AAA' ? 7.0 : 4.5;
        return contrastRatio >= requiredRatio;
    } catch (error) {
        console.warn('Error checking contrast requirements:', error);
        return false;
    }
}

/**
 * Get text color with opacity applied to background
 * @param {string} backgroundColor - Background color
 * @param {number} opacity - Opacity value between 0 and 1
 * @returns {string} - Appropriate text color considering opacity
 */
export function getTextColorWithOpacity(backgroundColor, opacity = 1.0) {
    if (opacity >= 0.7) {
        return getContrastingTextColor(backgroundColor);
    }
    
    // For low opacity backgrounds, consider the underlying surface
    // Assume white background underneath for simplicity
    const effectiveBg = blendColorWithWhite(backgroundColor, opacity);
    return getContrastingTextColor(effectiveBg);
}

/**
 * Blend a color with white background considering opacity
 * @param {string} color - Foreground color
 * @param {number} opacity - Opacity of foreground color
 * @returns {string} - Resulting blended color
 */
function blendColorWithWhite(color, opacity) {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // Blend with white (255, 255, 255)
    const blendedR = Math.round(r * opacity + 255 * (1 - opacity));
    const blendedG = Math.round(g * opacity + 255 * (1 - opacity));
    const blendedB = Math.round(b * opacity + 255 * (1 - opacity));
    
    const rHex = blendedR.toString(16).padStart(2, '0');
    const gHex = blendedG.toString(16).padStart(2, '0');
    const bHex = blendedB.toString(16).padStart(2, '0');
    
    return `#${rHex}${gHex}${bHex}`;
}
