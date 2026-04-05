import os
import io
import base64
import random
from fastapi import FastAPI, Request, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None

load_dotenv()

app = FastAPI(title="AnimaVox API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

EMOTIONS = ["Calm", "Excited", "Anxious", "Playful", "Curious", "Hungry"]
ANIMALS = ["Dog", "Cat", "Bird"]

@app.get("/")
def read_root():
    return {"status": "success", "message": "AnimaVox API is running"}

@app.post("/api/analyze-audio")
async def analyze_audio():
    return {
        "status": "success",
        "emotion": random.choice(EMOTIONS),
        "animal": random.choice(ANIMALS)
    }

@app.post("/api/analyze-vision")
async def analyze_vision(request: Request):
    data = await request.json()
    image_b64 = data.get("image")
    audio_emotion = data.get("emotion", "Unknown")
    animal_type = data.get("animal", "Animal")
    
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key and genai:
        try:
            client = genai.Client(api_key=api_key)
            
            # Shorter, more direct prompt for faster response
            prompt = f"You are translating for a {animal_type}. Audio detected: '{audio_emotion}'. Look at the image and give ONE short sentence (max 10 words) of what the {animal_type} wants, from its perspective. Be direct and specific."
            
            image_bytes = base64.b64decode(image_b64)
            response = client.models.generate_content(
                model='gemini-2.0-flash-exp',  # Using faster experimental model
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
    
    # Faster, more specific fallback responses based on animal type
    fallback_map = {
        ("Dog", "Calm"): "I'm relaxed and content right now.",
        ("Dog", "Excited"): "Let's play! I want to run!",
        ("Dog", "Anxious"): "Something's wrong, I'm worried.",
        ("Dog", "Playful"): "Throw the ball! Chase me!",
        ("Dog", "Curious"): "What's that smell? Let me investigate!",
        ("Dog", "Hungry"): "It's dinner time! Feed me!",
        ("Cat", "Calm"): "I'm comfortable here, don't disturb.",
        ("Cat", "Excited"): "I see something moving! Hunt mode!",
        ("Cat", "Anxious"): "I don't like this situation.",
        ("Cat", "Playful"): "Chase the string! Play with me!",
        ("Cat", "Curious"): "What's in that box?",
        ("Cat", "Hungry"): "My bowl is empty. Fill it now.",
        ("Bird", "Calm"): "I'm singing peacefully.",
        ("Bird", "Excited"): "I see food! Seeds!",
        ("Bird", "Anxious"): "Danger nearby! Alert!",
    }
    
    key = (animal_type, audio_emotion)
    translation = fallback_map.get(key, f"I'm a {animal_type} and I need your attention!")
    
    return {"translation": translation}

@app.post("/api/analyze-uploaded-audio")
async def analyze_uploaded_audio(request: Request):
    data = await request.json()
    audio_b64 = data.get("audio")
    mime_type = data.get("mime_type", "audio/mp3")
    
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key and genai:
        try:
            client = genai.Client(api_key=api_key)
            prompt = "Listen to this audio clip. Specifically, try to identify what animal it is (e.g. dog barking) and exactly what it is trying to communicate. Give a direct human-readable translation of its intent in one short sentence as if the animal is speaking."
            audio_bytes = base64.b64decode(audio_b64)
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=[
                    prompt, 
                    types.Part.from_bytes(
                        data=audio_bytes,
                        mime_type=mime_type,
                    )
                ]
            )
            return {"translation": response.text.replace('\n', ' ').strip()}
        except Exception as e:
            print(f"Gemini API Error: {e}")
            pass
            
    return {"translation": "I hear the audio, but the Gemini API key is missing or failed."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
