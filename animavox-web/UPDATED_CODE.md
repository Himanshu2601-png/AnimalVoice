# Code Updates for 4-Class Model

## After you finish training and exporting your model, apply these changes:

---

## File 1: Update page.js

Replace the model detection logic with this improved version that handles 4 classes.

### Changes to make in `src/app/page.js`:

1. **Update the MOOD_COLORS** (around line 5):

```javascript
const MOOD_COLORS = {
  Calm: 'from-teal-950 via-emerald-900 to-slate-950',
  Excited: 'from-orange-950 via-amber-900 to-slate-950',
  Anxious: 'from-rose-950 via-red-900 to-slate-950',
  Playful: 'from-indigo-950 via-purple-900 to-slate-950',
  Curious: 'from-blue-950 via-cyan-900 to-slate-950',
  Hungry: 'from-yellow-950 via-amber-800 to-slate-950',
  Distressed: 'from-red-950 via-pink-900 to-slate-950',  // NEW
  Default: 'from-slate-950 via-gray-900 to-slate-950'
};
```

2. **Update the detection logic** (around line 230):

Find this section:
```javascript
// If probability high and not just background noise
if (maxScore > 0.85 && maxLabel !== "Background Noise" && !isProcessingSnapshot) {
```

Replace the entire detection block with:
```javascript
// If probability high and not just background noise
if (maxScore > 0.85 && maxLabel !== "Background Noise" && !isProcessingSnapshot) {
    isProcessingSnapshot = true;
    
    // Set animal type based on detected sound
    let animalType = "Unknown";
    let emotionContext = maxLabel;
    
    if (maxLabel.toLowerCase().includes("dog bark")) {
        animalType = "Dog";
        emotionContext = "Dog Bark Alert";
        setMood("Excited");
    } else if (maxLabel.toLowerCase().includes("dog whine")) {
        animalType = "Dog";
        emotionContext = "Dog Whining/Distressed";
        setMood("Distressed");
    } else if (maxLabel.toLowerCase().includes("cat meow")) {
        animalType = "Cat";
        emotionContext = "Cat Meowing";
        setMood("Curious");
    }
    
    setAnimalDetected(animalType);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const base64Image = canvas.toDataURL("image/jpeg", 0.7).split(',')[1];
        try {
            const visionRes = await fetch("http://localhost:8000/api/analyze-vision", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    image: base64Image, 
                    emotion: emotionContext,
                    animal: animalType
                })
            });
            
            if (visionRes.ok) {
                const visionData = await visionRes.json();
                if (visionData.translation) {
                    setTranslations(prev => [
                      ...prev, 
                      { 
                        text: visionData.translation, 
                        time: new Date().toLocaleTimeString(), 
                        id: Date.now(),
                        animal: animalType,
                        emotion: maxLabel
                      }
                    ].slice(-5)); 
                }
            }
        } catch (err) {
            console.error("API Error", err);
            setTranslations(prev => [
              ...prev, 
              { 
                text: "Error connecting to AI service", 
                time: new Date().toLocaleTimeString(), 
                id: Date.now() 
              }
            ]);
        }
    }
    setTimeout(() => { isProcessingSnapshot = false; }, 4000);
}
```

3. **Update the translation display** (around line 340):

Find the translation display section and update it to show animal type:
```javascript
<p className={`font-medium tracking-wide text-sm md:text-base ${
  isLatest 
    ? 'text-purple-100 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]' 
    : 'text-white/60'
}`}>
  {isLatest ? <TypewriterText text={msg.text} /> : msg.text}
</p>
<span className="text-[10px] text-white/30 tracking-widest uppercase mt-3 block">
  {msg.time} • {msg.animal || animalDetected} {msg.emotion ? `(${msg.emotion})` : 'Intent'}
</span>
```

---

## File 2: Update Backend API (Optional Enhancement)

Update `api/main.py` to handle the animal type:

Find the `/api/analyze-vision` endpoint and update the prompt:

```python
@app.post("/api/analyze-vision")
async def analyze_vision(request: Request):
    data = await request.json()
    image_b64 = data.get("image")
    audio_emotion = data.get("emotion", "Unknown")
    animal_type = data.get("animal", "Animal")  # NEW
    
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key and genai:
        try:
            client = genai.Client(api_key=api_key)
            
            # Enhanced prompt with animal type
            prompt = f"""You are analyzing a {animal_type}'s behavior. 
            The audio detected: '{audio_emotion}'.
            
            Look at the image and analyze:
            1. The {animal_type}'s body language and posture
            2. The surrounding environment
            3. Any objects or people nearby
            
            Combine the visual context with the audio state to provide a direct, 
            human-readable 1-sentence translation of what the {animal_type} wants or feels, 
            spoken from the {animal_type}'s first-person perspective.
            
            Be specific and natural. Examples:
            - "I hear someone at the door and I need to protect my home!"
            - "I'm hungry and my food bowl is empty."
            - "I want to play with that toy on the floor!"
            """
            
            image_bytes = base64.b64decode(image_b64)
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=[
                    prompt, 
                    types.Part.from_bytes(
                        data=image_bytes,
                        mime_type='image/jpeg',
                    )
                ]
            )
            return {"translation": response.text.replace('\n', ' ').strip()}
        except Exception as e:
            print(f"Gemini API error: {e}")
            pass
    
    # Enhanced fallback responses
    fallback_map = {
        "Dog Bark Alert": "I hear something interesting and need to alert you!",
        "Dog Whining/Distressed": "I'm feeling anxious or need something urgently.",
        "Cat Meowing": "I require your attention for something important.",
    }
    
    return {
        "translation": fallback_map.get(audio_emotion, f"I am a {animal_type} trying to communicate with you.")
    }
```

---

## Testing Your New Model

### Step 1: Start Backend
```bash
cd api
python main.py
```

### Step 2: Start Frontend
```bash
cd animavox-web
npm run dev
```

### Step 3: Test Each Class

1. **Test Background Noise:**
   - Click "Start Camera"
   - Stay silent
   - Should NOT trigger any translation
   - Waveform should show minimal activity

2. **Test Dog Bark:**
   - Play dog barking video on YouTube
   - Should detect "Dog Bark"
   - Background should turn orange (Excited)
   - Should capture frame and generate translation
   - Translation should mention dog's intent

3. **Test Dog Whine:**
   - Play dog whining sound
   - Should detect "Dog Whine"
   - Background should turn red (Distressed)
   - Translation should reflect anxiety/need

4. **Test Cat Meow:**
   - Play cat meowing sound
   - Should detect "Cat Meow"
   - Background should turn blue (Curious)
   - Translation should reflect cat's intent

---

## Troubleshooting

### Model Not Loading
**Error:** "Failed to load TM model"

**Fix:**
1. Check browser console (F12)
2. Verify files exist:
   ```bash
   ls animavox-web/public/my_model/
   ```
3. Should see: model.json, weights.bin, metadata.json

### Wrong Class Names
**Error:** Detection not working

**Fix:**
1. Open `animavox-web/public/my_model/metadata.json`
2. Check the "wordLabels" array
3. Update the code to match EXACT class names:
   ```javascript
   if (maxLabel === "Dog Bark") {  // Must match metadata.json exactly
   ```

### Low Confidence
**Error:** Nothing triggers (maxScore always <0.85)

**Fix:**
1. Lower threshold temporarily:
   ```javascript
   if (maxScore > 0.70 && maxLabel !== "Background Noise") {
   ```
2. Add more training samples
3. Retrain model

### API Not Responding
**Error:** "Error connecting to AI service"

**Fix:**
1. Check backend is running: http://localhost:8000
2. Check GEMINI_API_KEY in `api/.env`
3. Check browser console for CORS errors

---

## Performance Optimization

### Reduce False Positives
```javascript
// Add confidence logging
console.log(`Detected: ${maxLabel} (${(maxScore * 100).toFixed(1)}%)`);

// Require higher confidence for background noise
if (maxLabel === "Background Noise" && maxScore < 0.95) {
    // Ignore low-confidence background detections
    return;
}
```

### Add Cooldown Timer Display
```javascript
const [cooldownRemaining, setCooldownRemaining] = useState(0);

// In detection logic:
setTimeout(() => { 
    isProcessingSnapshot = false; 
    setCooldownRemaining(0);
}, 4000);

// Update cooldown every second
const cooldownInterval = setInterval(() => {
    setCooldownRemaining(prev => Math.max(0, prev - 1));
}, 1000);
```

---

## Next Steps After Testing

1. **Collect Real Usage Data:**
   - Log all detections
   - Track accuracy
   - Note false positives

2. **Improve Model:**
   - Add more samples for low-accuracy classes
   - Balance dataset better
   - Retrain with 150+ epochs

3. **Add Features:**
   - History view of all translations
   - Export translations as text
   - Multi-language support
   - Mobile app version

---

## Summary

After training your model:
1. ✅ Export from Teachable Machine
2. ✅ Copy to `animavox-web/public/my_model/`
3. ✅ Update page.js with new detection logic
4. ✅ Update backend with enhanced prompts
5. ✅ Test all 4 classes
6. ✅ Optimize based on results

Your AnimaVox is now ready for the interview! 🚀
