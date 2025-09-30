export default async function handler(req, res) {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // 处理预检请求
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    // 只允许POST请求
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        // 生成唯一的请求ID来跟踪多次调用
        const requestId = Math.random().toString(36).substring(2, 15);
        
        console.log('=== New Image Generation Request ===');
        console.log('Request ID:', requestId);
        console.log('Timestamp:', new Date().toISOString());
        console.log('Received request:', req.body);
        
        const { prompt, model, size, quality, style, n } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }
        
        console.log(`[${requestId}] Generating image with prompt:`, prompt);
        console.log(`[${requestId}] Request body:`, JSON.stringify(req.body, null, 2));
        
        // 使用Gemini API生成图片
        console.log(`[${requestId}] Using Gemini API for image generation`);
        
        // 构建图片生成prompt
        let imagePrompt = `Generate a high-quality food image of: ${prompt}`;
        
        console.log(`[${requestId}] 构建的图片生成prompt:`, imagePrompt);
        
        // 使用Gemini 2.5 Flash Image Preview API
        const requestBody = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": imagePrompt
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.7,
                "topK": 20,
                "topP": 0.8,
                "maxOutputTokens": 1024
            },
            "safetySettings": [
                {
                    "category": "HARM_CATEGORY_HARASSMENT",
                    "threshold": "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    "category": "HARM_CATEGORY_HATE_SPEECH",
                    "threshold": "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    "threshold": "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                    "threshold": "BLOCK_MEDIUM_AND_ABOVE"
                }
            ]
        };
        
        console.log(`[${requestId}] Gemini API request body:`, JSON.stringify(requestBody, null, 2));
        
        let geminiResponse;
        try {
            console.log(`[${requestId}] Making request to Gemini API...`);
            
            // 创建AbortController用于超时控制
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时
            
            // 使用图片生成模型
            geminiResponse = await fetch('https://ai.juguang.chat/v1beta/models/gemini-2.5-flash-image-preview:generateContent', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer sk-o4mIilLIlhQurOQ8TE1DhtCQYk7m4Q8sR0foh2JCvYzuDfHX',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            console.log(`[${requestId}] Gemini API request completed, status:`, geminiResponse.status);
            
            // 如果是429错误，等待一段时间后重试一次
            if (geminiResponse.status === 429) {
                console.log(`[${requestId}] Rate limit hit, waiting 2 seconds before retry...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                console.log(`[${requestId}] Retrying Gemini API request...`);
                const retryController = new AbortController();
                const retryTimeoutId = setTimeout(() => retryController.abort(), 60000);
                
                geminiResponse = await fetch('https://ai.juguang.chat/v1beta/models/gemini-2.5-flash-image-preview:generateContent', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer sk-o4mIilLIlhQurOQ8TE1DhtCQYk7m4Q8sR0foh2JCvYzuDfHX',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody),
                    signal: retryController.signal
                });
                
                clearTimeout(retryTimeoutId);
                console.log(`[${requestId}] Gemini API retry completed, status:`, geminiResponse.status);
            }
        } catch (fetchError) {
            console.error('Gemini API fetch error:', fetchError);
            console.log('Gemini API failed due to fetch error, using Unsplash as fallback');
            
            // 直接使用Unsplash作为备用
            const unsplashResponse = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(prompt)}&per_page=3&orientation=landscape&order_by=relevant&client_id=YRtZM4GfSkIrBBbFBFlrDO98J91yjUBEhgxRx1yblA4`);
            
            if (unsplashResponse.ok) {
                const unsplashResult = await unsplashResponse.json();
                if (unsplashResult.results && unsplashResult.results.length > 0) {
                    const imageUrl = unsplashResult.results[0].urls.regular;
                    return res.status(200).json({
                        success: true,
                        data: [{
                            url: imageUrl,
                            alt: unsplashResult.results[0].alt_description || prompt
                        }],
                        prompt: prompt,
                        source: 'unsplash_fallback'
                    });
                }
            }
            
            return res.status(500).json({ 
                error: `Gemini API fetch failed: ${fetchError.message}` 
            });
        }
        
        console.log('Gemini API response status:', geminiResponse.status);
        console.log('Gemini API response headers:', Object.fromEntries(geminiResponse.headers.entries()));
        
        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            console.error(`[${requestId}] Gemini API error:`, geminiResponse.status, errorText);
            console.error(`[${requestId}] Gemini API error details:`, {
                status: geminiResponse.status,
                statusText: geminiResponse.statusText,
                headers: Object.fromEntries(geminiResponse.headers.entries()),
                body: errorText
            });
            
            // 检查是否是配额超限错误
            if (geminiResponse.status === 429) {
                console.log(`[${requestId}] Gemini API quota exceeded, using Unsplash as fallback`);
                console.log(`[${requestId}] Error message: You exceeded your current quota, please check your plan and billing details`);
            } else {
                console.log(`[${requestId}] Gemini API failed with status ${geminiResponse.status}, using Unsplash as fallback`);
            }
            const unsplashResponse = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(prompt)}&per_page=3&orientation=landscape&order_by=relevant&client_id=YRtZM4GfSkIrBBbFBFlrDO98J91yjUBEhgxRx1yblA4`);
            
            if (unsplashResponse.ok) {
                const unsplashResult = await unsplashResponse.json();
                if (unsplashResult.results && unsplashResult.results.length > 0) {
                    const imageUrl = unsplashResult.results[0].urls.regular;
                    return res.status(200).json({
                        success: true,
                        data: [{
                            url: imageUrl,
                            alt: unsplashResult.results[0].alt_description || prompt
                        }],
                        prompt: prompt,
                        source: 'unsplash_fallback'
                    });
                }
            }
            
            return res.status(geminiResponse.status).json({ 
                error: `Gemini API error: ${geminiResponse.status} - ${errorText}` 
            });
        }
        
        const result = await geminiResponse.json();
        console.log(`[${requestId}] Gemini API response:`, JSON.stringify(result, null, 2));
        
        // 检查Gemini API响应的实际结构
        console.log(`[${requestId}] Checking Gemini response structure...`);
        console.log(`[${requestId}] Has candidates:`, !!result.candidates);
        console.log(`[${requestId}] Candidates length:`, result.candidates ? result.candidates.length : 0);
        console.log(`[${requestId}] Response keys:`, Object.keys(result));
        
        // 检查是否有finishReason字段，这可能表明生成状态
        if (result.candidates && result.candidates.length > 0) {
            const candidate = result.candidates[0];
            console.log(`[${requestId}] Candidate finishReason:`, candidate.finishReason);
            console.log(`[${requestId}] Candidate safetyRatings:`, candidate.safetyRatings);
            
            // 检查是否因为安全原因被阻止
            if (candidate.finishReason === 'SAFETY') {
                console.log(`[${requestId}] Gemini API blocked due to safety concerns`);
                console.log(`[${requestId}] Safety ratings:`, candidate.safetyRatings);
            }
            
            // 检查是否因为其他原因被阻止
            if (candidate.finishReason === 'RECITATION') {
                console.log(`[${requestId}] Gemini API blocked due to recitation concerns`);
            }
            
            if (candidate.finishReason === 'OTHER') {
                console.log(`[${requestId}] Gemini API blocked for other reasons`);
            }
        }
        
        // 首先检查是否有直接的图片URL
        if (result.images && Array.isArray(result.images) && result.images.length > 0) {
            console.log(`[${requestId}] Found images in result.images:`, result.images);
            return res.status(200).json({
                success: true,
                data: result.images.map(img => ({
                    url: img.url || img,
                    alt: prompt
                })),
                prompt: prompt,
                source: 'gemini_direct'
            });
        }
        
        // 检查是否有其他直接的图片字段
        if (result.image && result.image.url) {
            console.log(`[${requestId}] Found image in result.image:`, result.image);
            return res.status(200).json({
                success: true,
                data: [{
                    url: result.image.url,
                    alt: prompt
                }],
                prompt: prompt,
                source: 'gemini_single'
            });
        }
        
        if (result.candidates && result.candidates.length > 0) {
            const candidate = result.candidates[0];
            console.log('First candidate:', JSON.stringify(candidate, null, 2));
            
            if (candidate.content && candidate.content.parts) {
                console.log('Content parts length:', candidate.content.parts.length);
                
                for (let i = 0; i < candidate.content.parts.length; i++) {
                    const part = candidate.content.parts[i];
                    console.log(`Part ${i}:`, JSON.stringify(part, null, 2));
                    
                    if (part.inlineData && part.inlineData.data) {
                        // Gemini返回的是base64编码的图片数据
                        const imageData = part.inlineData.data;
                        const mimeType = part.inlineData.mimeType || 'image/jpeg';
                        
                        console.log('Gemini API returned image data, mimeType:', mimeType);
                        console.log('Image data length:', imageData ? imageData.length : 0);
                        
                        return res.status(200).json({
                            success: true,
                            data: [{
                                url: `data:${mimeType};base64,${imageData}`,
                                alt: prompt
                            }],
                            prompt: prompt,
                            source: 'gemini'
                        });
                    }
                }
            }
        }
        
        // 尝试其他可能的响应结构
        console.log('Trying alternative response structures...');
        
        // 检查是否有直接的图片URL
        if (result.images && result.images.length > 0) {
            console.log('Found images in result.images');
            return res.status(200).json({
                success: true,
                data: result.images.map(img => ({
                    url: img.url || img,
                    alt: prompt
                })),
                prompt: prompt,
                source: 'gemini_alternative'
            });
        }
        
        // 检查是否有其他结构
        if (result.data && result.data.length > 0) {
            console.log('Found images in result.data');
            return res.status(200).json({
                success: true,
                data: result.data.map(img => ({
                    url: img.url || img,
                    alt: prompt
                })),
                prompt: prompt,
                source: 'gemini_data'
            });
        }
        
        // 检查是否有文本描述（可能Gemini返回的是文本而不是图片）
        if (result.candidates && result.candidates.length > 0) {
            const candidate = result.candidates[0];
            if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                    if (part.text) {
                        console.log(`[${requestId}] Gemini returned text instead of image:`, part.text);
                        // 如果返回的是文本描述，我们可以使用这个描述来搜索Unsplash
                        const searchQuery = part.text.substring(0, 100); // 限制长度
                        console.log(`[${requestId}] Using Gemini text description for Unsplash search:`, searchQuery);
                        
                        const unsplashResponse = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&per_page=3&orientation=landscape&order_by=relevant&client_id=YRtZM4GfSkIrBBbFBFlrDO98J91yjUBEhgxRx1yblA4`);
                        
                        if (unsplashResponse.ok) {
                            const unsplashResult = await unsplashResponse.json();
                            if (unsplashResult.results && unsplashResult.results.length > 0) {
                                const imageUrl = unsplashResult.results[0].urls.regular;
                                return res.status(200).json({
                                    success: true,
                                    data: [{
                                        url: imageUrl,
                                        alt: part.text.substring(0, 100)
                                    }],
                                    prompt: prompt,
                                    source: 'unsplash_with_gemini_description'
                                });
                            }
                        }
                    }
                }
            }
        }
        
        // 如果没有找到图片数据，使用Unsplash作为备用
        console.log(`[${requestId}] Gemini API did not return image data in expected format, using Unsplash as fallback`);
        console.log(`[${requestId}] Full response structure for debugging:`, {
            hasCandidates: !!result.candidates,
            candidatesLength: result.candidates ? result.candidates.length : 0,
            responseKeys: Object.keys(result),
            firstCandidateKeys: result.candidates && result.candidates[0] ? Object.keys(result.candidates[0]) : null,
            finishReason: result.candidates && result.candidates[0] ? result.candidates[0].finishReason : null,
            safetyRatings: result.candidates && result.candidates[0] ? result.candidates[0].safetyRatings : null
        });
        const unsplashResponse = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(prompt)}&per_page=3&orientation=landscape&order_by=relevant&client_id=YRtZM4GfSkIrBBbFBFlrDO98J91yjUBEhgxRx1yblA4`);
        
        if (unsplashResponse.ok) {
            const unsplashResult = await unsplashResponse.json();
            if (unsplashResult.results && unsplashResult.results.length > 0) {
                const imageUrl = unsplashResult.results[0].urls.regular;
                return res.status(200).json({
                    success: true,
                    data: [{
                        url: imageUrl,
                        alt: unsplashResult.results[0].alt_description || prompt
                    }],
                    prompt: prompt,
                    source: 'unsplash_fallback'
                });
            }
        }
        
        return res.status(500).json({ 
            error: 'No images generated by Gemini or Unsplash' 
        });
        
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            error: `Server error: ${error.message}`,
            stack: error.stack,
            name: error.name
        });
    }
}