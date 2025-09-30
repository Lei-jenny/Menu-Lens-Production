export default async function handler(req, res) {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    try {
        // 生成唯一的请求ID来跟踪多次调用
        const requestId = Math.random().toString(36).substring(2, 15);
        
        console.log('=== New Menu Scan Request ===');
        console.log('Request ID:', requestId);
        console.log('Timestamp:', new Date().toISOString());
        console.log('Received request:', req.body);
        
        const { imageData, imageType } = req.body;
        
        if (!imageData) {
            return res.status(400).json({ error: 'Image data is required' });
        }
        
        console.log(`[${requestId}] Scanning menu image...`);
        console.log(`[${requestId}] Image type:`, imageType);
        
        // 构建菜单扫描prompt
        const scanPrompt = `You are an AI that converts a menu image into a specific JSON format. Your response MUST be a single, valid JSON code block and nothing else.

Schema:
Strictly follow this structure. The top-level original key should be the menu's source language.

JSON example:
{
  "original": "Japanese",
  "dishes": [
    {
      "original": "道産牛の炙り物",
      "english": "Grilled Hokkaido beef",
      "chinese": "炙烤北海道牛肉",
      "japanese": "道産牛の炙り物",
      "description": "牛肉 玉子豆腐 自家製 一味味噌辛子",
      "description_en": "Beef with egg tofu and homemade spicy miso mustard.",
      "description_zh": "牛肉配玉子豆腐和自制辣味噌芥末。",
      "description_ja": "牛肉と玉子豆腐、自家製一味味噌辛子。",
      "tags": ["contains-beef", "contains-egg"],
      "nutrition": {
        "calories": 450,
        "protein": 35,
        "carbs": 8,
        "fat": 28,
        "sodium": 680,
        "allergens": "Beef, Egg, Soy"
      }
    }
  ]
}

Rules:
- original & description: Use text exactly from the image. If there is no description, use an empty string "".
- Translations: Provide translations for the name and description in English (en), Chinese (zh), and Japanese (ja).
- tags: Infer ingredients. Must be an array of strings from this list only: ["contains-seafood", "contains-beef", "contains-poultry", "contains-pork", "contains-egg", "contains-nuts", "contains-dairy", "contains-gluten", "vegetarian", "vegan", "spicy", "alcohol"].
- nutrition:
  - calories: Estimate calories per serving (typical range: 200-800 for main dishes, 100-400 for appetizers)
  - protein: Estimate protein in grams (typical range: 10-50g for main dishes, 5-20g for appetizers)
  - carbs: Estimate carbohydrates in grams (typical range: 5-60g for main dishes, 2-30g for appetizers)
  - fat: Estimate fat in grams (typical range: 5-40g for main dishes, 2-20g for appetizers)
  - sodium: Estimate sodium in milligrams (typical range: 200-1500mg for main dishes, 100-800mg for appetizers)
  - allergens: A comma-separated string from this list only: ["Fish", "Shellfish", "Beef", "Poultry", "Pork", "Egg", "Soy", "Wheat", "Dairy", "Nuts", "Alcohol"]. Use "None" if no allergens are found.
  - Base estimates on dish type, ingredients, and cooking method. Use reasonable ranges for restaurant portions.

If the image is not a menu, return: {"error": "This image does not appear to be a menu. Please upload a clear menu image."}`;
        
        console.log(`[${requestId}] Using Gemini 2.0 Flash Lite for menu scanning`);
        
        // 使用Gemini 2.0 Flash Lite API
        const requestBody = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": scanPrompt
                        },
                        {
                            "inlineData": {
                                "mimeType": imageType || "image/jpeg",
                                "data": imageData
                            }
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.3,
                "topK": 20,
                "topP": 0.8,
                "maxOutputTokens": 2048
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
            
            geminiResponse = await fetch('https://ai.juguang.chat/v1beta/models/gemini-2.0-flash-lite:generateContent', {
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
            
        } catch (fetchError) {
            console.error(`[${requestId}] Gemini API fetch error:`, fetchError);
            console.log(`[${requestId}] Gemini API failed due to fetch error, using sample data`);
            
            // 返回示例数据作为备用
            return res.status(200).json({
                success: true,
                data: {
                    "original": "English",
                    "dishes": [
                        {
                            "original": "Sample Dish 1",
                            "english": "Sample Dish 1",
                            "chinese": "示例菜品 1",
                            "japanese": "サンプル料理 1",
                            "description": "Sample description",
                            "description_en": "Sample description",
                            "description_zh": "示例描述",
                            "description_ja": "サンプル説明",
                            "tags": ["vegetarian"],
                            "nutrition": {
                                "calories": 320,
                                "protein": 12,
                                "carbs": 45,
                                "fat": 8,
                                "sodium": 420,
                                "allergens": "None"
                            }
                        }
                    ]
                },
                source: 'sample_fallback',
                error: 'API fetch failed, using sample data'
            });
        }
        
        console.log(`[${requestId}] Gemini API response status:`, geminiResponse.status);
        console.log(`[${requestId}] Gemini API response headers:`, Object.fromEntries(geminiResponse.headers.entries()));
        
        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            console.error(`[${requestId}] Gemini API error:`, geminiResponse.status, errorText);
            console.log(`[${requestId}] Gemini API failed, using sample data`);
            
            // 返回示例数据作为备用
            return res.status(200).json({
                success: true,
                data: {
                    "original": "English",
                    "dishes": [
                        {
                            "original": "Sample Dish 1",
                            "english": "Sample Dish 1",
                            "chinese": "示例菜品 1",
                            "japanese": "サンプル料理 1",
                            "description": "Sample description",
                            "description_en": "Sample description",
                            "description_zh": "示例描述",
                            "description_ja": "サンプル説明",
                            "tags": ["vegetarian"],
                            "nutrition": {
                                "calories": 320,
                                "protein": 12,
                                "carbs": 45,
                                "fat": 8,
                                "sodium": 420,
                                "allergens": "None"
                            }
                        }
                    ]
                },
                source: 'sample_fallback',
                error: `Gemini API error: ${geminiResponse.status}`
            });
        }
        
        const result = await geminiResponse.json();
        console.log(`[${requestId}] Gemini API response:`, JSON.stringify(result, null, 2));
        
        // 检查Gemini API响应的实际结构
        console.log(`[${requestId}] Checking Gemini response structure...`);
        console.log(`[${requestId}] Has candidates:`, !!result.candidates);
        console.log(`[${requestId}] Candidates length:`, result.candidates ? result.candidates.length : 0);
        
        if (result.candidates && result.candidates.length > 0) {
            const candidate = result.candidates[0];
            console.log(`[${requestId}] First candidate:`, JSON.stringify(candidate, null, 2));
            
            if (candidate.content && candidate.content.parts) {
                console.log(`[${requestId}] Content parts length:`, candidate.content.parts.length);
                
                for (let i = 0; i < candidate.content.parts.length; i++) {
                    const part = candidate.content.parts[i];
                    console.log(`[${requestId}] Part ${i}:`, JSON.stringify(part, null, 2));
                    
                    if (part.text) {
                        console.log(`[${requestId}] Gemini returned text:`, part.text);
                        
                        try {
                            // 尝试解析JSON响应
                            const jsonMatch = part.text.match(/```json\s*([\s\S]*?)\s*```/) || part.text.match(/\{[\s\S]*\}/);
                            const jsonText = jsonMatch ? jsonMatch[1] || jsonMatch[0] : part.text;
                            
                            console.log(`[${requestId}] Extracted JSON text:`, jsonText);
                            
                            const menuData = JSON.parse(jsonText);
                            console.log(`[${requestId}] Parsed menu data:`, JSON.stringify(menuData, null, 2));
                            
                            // 检查是否是错误响应
                            if (menuData.error) {
                                console.log(`[${requestId}] Menu scan error:`, menuData.error);
                                return res.status(200).json({
                                    success: false,
                                    error: menuData.error,
                                    source: 'gemini_scan'
                                });
                            }
                            
                            // 验证数据结构
                            if (menuData.original && menuData.dishes && Array.isArray(menuData.dishes)) {
                                console.log(`[${requestId}] Menu scan successful`);
                                return res.status(200).json({
                                    success: true,
                                    data: menuData,
                                    source: 'gemini_scan'
                                });
                            } else {
                                console.log(`[${requestId}] Invalid menu data structure`);
                                throw new Error('Invalid menu data structure');
                            }
                            
                        } catch (parseError) {
                            console.error(`[${requestId}] JSON parse error:`, parseError);
                            console.log(`[${requestId}] Using sample data due to parse error`);
                            
                            // 返回示例数据作为备用
                            return res.status(200).json({
                                success: true,
                                data: {
                                    "original": "English",
                                    "dishes": [
                                        {
                                            "original": "Sample Dish 1",
                                            "english": "Sample Dish 1",
                                            "chinese": "示例菜品 1",
                                            "japanese": "サンプル料理 1",
                                            "description": "Sample description",
                                            "description_en": "Sample description",
                                            "description_zh": "示例描述",
                                            "description_ja": "サンプル説明",
                                            "tags": ["vegetarian"],
                                            "nutrition": {
                                                "calories": null,
                                                "protein": null,
                                                "carbs": null,
                                                "fat": null,
                                                "sodium": null,
                                                "allergens": "None"
                                            }
                                        }
                                    ]
                                },
                                source: 'sample_fallback',
                                error: 'JSON parse failed, using sample data'
                            });
                        }
                    }
                }
            }
        }
        
        // 如果没有找到有效响应，返回示例数据
        console.log(`[${requestId}] No valid response found, using sample data`);
        return res.status(200).json({
            success: true,
            data: {
                "original": "English",
                "dishes": [
                    {
                        "original": "Sample Dish 1",
                        "english": "Sample Dish 1",
                        "chinese": "示例菜品 1",
                        "japanese": "サンプル料理 1",
                        "description": "Sample description",
                        "description_en": "Sample description",
                        "description_zh": "示例描述",
                        "description_ja": "サンプル説明",
                        "tags": ["vegetarian"],
                        "nutrition": {
                            "calories": null,
                            "protein": null,
                            "carbs": null,
                            "fat": null,
                            "sodium": null,
                            "allergens": "None"
                        }
                    }
                ]
            },
            source: 'sample_fallback',
            error: 'No valid response found'
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
