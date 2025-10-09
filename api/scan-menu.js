export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const requestId = Math.random().toString(36).substring(2, 15);
        console.log('=== New Menu Scan Request ===');
        console.log('Request ID:', requestId);

        const { imageData, imageType } = req.body;

        if (!imageData) {
            return res.status(400).json({ error: 'Image data is required' });
        }

        console.log(`[${requestId}] Scanning menu image...`);

        // The prompt remains the same
        const scanPrompt = `You are an AI that analyzes and digitizes a menu image into a specific JSON format... (your full prompt text goes here)`;
        
        // Use the Gemini API - send image and text prompt
        const requestBody = {
            "contents": [{
                "parts": [
                    { "text": scanPrompt },
                    {
                        "inlineData": {
                            "mimeType": imageType || "image/jpeg",
                            "data": imageData
                        }
                    }
                ]
            }],
            "generationConfig": {
                // CHANGE 1: Force the model to output valid JSON. This is the most important fix.
                "responseMimeType": "application/json",
                "temperature": 0.3,
                "topK": 20,
                "topP": 0.8,
                "maxOutputTokens": 8192 // Increased for potentially large menus
            },
            // Safety settings remain the same
            "safetySettings": [ 
              { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE" },
              { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE" },
              { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE" },
              { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE" }
            ]
        };

        // API call logic remains largely the same
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

        const geminiResponse = await fetch('https://ai.juguang.chat/v1beta/models/gemini-2.0-flash-lite:generateContent', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer sk-o4mIilLIlhQurOQ8TE1DhtCQYk7m4Q8sR0foh2JCvYzuDfHX',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            console.error(`[${requestId}] Gemini API error:`, geminiResponse.status, errorText);
            throw new Error(`Gemini API responded with status ${geminiResponse.status}`);
        }
        
        const result = await geminiResponse.json();
        console.log(`[${requestId}] Gemini API response received.`);

        // CHANGE 2: Directly parse the guaranteed JSON output. No more complex regex needed.
        if (result.candidates && result.candidates.length > 0) {
            const textResponse = result.candidates[0].content.parts[0].text;
            console.log(`[${requestId}] Attempting to parse JSON from response...`);
            
            // The response text IS the JSON string, so we parse it directly.
            const menuData = JSON.parse(textResponse); 

            console.log(`[${requestId}] Menu scan successful`);
            return res.status(200).json({
                success: true,
                data: menuData,
                source: 'gemini_scan'
            });
        } else {
            throw new Error('No valid candidates returned from Gemini API.');
        }

    } catch (error) {
        // Centralized error handling for API failures, timeouts, or parsing errors.
        console.error('Server error:', error);
        
        // Fallback to sample data on any error
        return res.status(500).json({
            success: false,
            error: `Server error: ${error.message}`,
            data: { /* Your sample data structure */ },
            source: 'sample_fallback'
        });
    }
}
