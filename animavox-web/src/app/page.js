"use client";
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Video, VideoOff, History, Activity, Dog, Cat, Bird, HelpCircle, Upload, Music } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '${API_URL}';

const MOOD_COLORS = {
  Calm: 'from-teal-950 via-emerald-900 to-slate-950',
  Excited: 'from-orange-950 via-amber-900 to-slate-950',
  Anxious: 'from-rose-950 via-red-900 to-slate-950',
  Playful: 'from-indigo-950 via-purple-900 to-slate-950',
  Curious: 'from-blue-950 via-cyan-900 to-slate-950',
  Hungry: 'from-yellow-950 via-amber-800 to-slate-950',
  Default: 'from-slate-950 via-gray-900 to-slate-950'
};

const TypewriterText = ({ text }) => {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    setDisplayedText("");
    let i = 0;
    const intervalId = setInterval(() => {
      setDisplayedText(text.slice(0, i));
      i++;
      if (i > text.length) {
        clearInterval(intervalId);
      }
    }, 40);
    return () => clearInterval(intervalId);
  }, [text]);

  return <span>{displayedText}</span>;
};

export default function Home() {
  const [mood, setMood] = useState('Default');
  const [animalDetected, setAnimalDetected] = useState('Unknown');
  const [translations, setTranslations] = useState([
    { text: "Waiting for animal...", time: new Date().toLocaleTimeString(), id: 0 }
  ]);
  const [isRecording, setIsRecording] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [uploadedMedia, setUploadedMedia] = useState(null);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const animationFrameRef = useRef(null);
  const [audioData, setAudioData] = useState(new Array(32).fill(15));
  
  const [recognizer, setRecognizer] = useState(null);

  // Load Custom Teachable Machine Model
  useEffect(() => {
    async function initModel() {
      try {
        const tf = await import('@tensorflow/tfjs');
        const speechCommands = await import('@tensorflow-models/speech-commands');

        const URL = "/my_model/";
        const checkpointURL = URL + "model.json";
        const metadataURL = URL + "metadata.json";

        const recognizerInstance = speechCommands.create(
            "BROWSER_FFT",
            null,
            checkpointURL,
            metadataURL);

        await recognizerInstance.ensureModelLoaded();
        setRecognizer(recognizerInstance);
        console.log("Teachable Machine Custom Audio Model loaded successfully.");
      } catch (err) {
        console.error("Failed to load TM model: Make sure my_model folder is in public/", err);
      }
    }
    initModel();
  }, []);

  const toggleCamera = async () => {
    if (isRecording || uploadedMedia) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const startRecording = async () => {
    try {
      stopRecording();
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setIsRecording(true);
      
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64; 
      const source = audioCtx.createMediaStreamSource(mediaStream);
      source.connect(analyser);
      
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      
      drawWaveform();
    } catch (err) {
      console.error("Error accessing media devices:", err);
    }
  };

  const stopRecording = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(console.error);
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.src = "";
    }
    streamRef.current = null;
    setIsRecording(false);
    setUploadedMedia(null);
    setAudioData(new Array(32).fill(15));
  };

  const drawWaveform = () => {
    if (!analyserRef.current || !dataArrayRef.current) return;
    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    const newData = Array.from(dataArrayRef.current).map(val => {
      const percent = (val / 255) * 100;
      return Math.max(15, percent); 
    });
    setAudioData(newData);
    animationFrameRef.current = requestAnimationFrame(drawWaveform);
  };

  const toggleMic = () => {
    if (streamRef.current) {
      const audioTracks = streamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !micEnabled;
      });
      setMicEnabled(!micEnabled);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    stopRecording();
    const type = file.type.split('/')[0];
    const url = URL.createObjectURL(file);
    
    setUploadedMedia({ type, url });
    setTranslations([{ text: `Analyzing uploaded ${type}...`, time: new Date().toLocaleTimeString(), id: Date.now() }]);

    setTimeout(() => {
        if (type === 'video' && videoRef.current) {
            videoRef.current.src = url;
            setIsRecording(true); 
        } else if (type === 'audio') {
            setIsRecording(false); 
            analyzeUploadedAudio(file);
        } else {
            analyzeStaticImage(file);
        }
    }, 500);
  };

  const analyzeUploadedAudio = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Audio = e.target.result.split(',')[1];
      try {
          const res = await fetch(`${API_URL}/api/analyze-uploaded-audio`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audio: base64Audio, mime_type: file.type })
          });
          if (res.ok) {
              const data = await res.json();
              setMood('Default');
              if (data.translation) {
                  setTranslations(prev => [
                    ...prev, 
                    { text: data.translation, time: new Date().toLocaleTimeString(), id: Date.now() }
                  ].slice(-5)); 
              }
          }
      } catch (err) {
          console.error("Audio analysis error", err);
          setTranslations(prev => [...prev, { text: "Error connecting to AI", time: new Date().toLocaleTimeString(), id: Date.now() }]);
      }
    };
    reader.readAsDataURL(file);
  };

  const analyzeStaticImage = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Image = e.target.result.split(',')[1];
      try {
          const visionRes = await fetch("${API_URL}/api/analyze-vision", {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image: base64Image, emotion: "Unknown" })
          });
          if (visionRes.ok) {
              const visionData = await visionRes.json();
              if (visionData.translation) {
                  setTranslations(prev => [
                    ...prev, 
                    { text: visionData.translation, time: new Date().toLocaleTimeString(), id: Date.now() }
                  ].slice(-5)); 
              }
          }
      } catch (err) {
          console.error("Static image analysis error", err);
      }
    };
    reader.readAsDataURL(file);
  };

  // Main Pipeline: Uses Custom TM Model if available or falls back to backend Mock API
  useEffect(() => {
    if (!isRecording) return;
    
    // Fallback Mock Logic if TM Model hasn't loaded
    if (!recognizer) {
        let isProcessing = false;
        const interval = setInterval(async () => {
          if (isProcessing || (!micEnabled && !uploadedMedia)) return;
          isProcessing = true;
          
          // Show immediate feedback
          setTranslations(prev => [...prev, { 
            text: "🎧 Analyzing sound...", 
            time: new Date().toLocaleTimeString(), 
            id: Date.now(),
            isLoading: true
          }].slice(-5));
          
          try {
            const audioRes = await fetch("${API_URL}/api/analyze-audio", { method: 'POST' });
            if (audioRes.ok) {
              const fetchedAudioData = await audioRes.json();
              const detectedAnimal = fetchedAudioData.animal || "Unknown";
              const detectedEmotion = fetchedAudioData.emotion || "Default";
              
              setMood(detectedEmotion);
              setAnimalDetected(detectedAnimal);
              
              // Quick animal type message
              const quickMessage = `${detectedAnimal === "Dog" ? "🐕" : detectedAnimal === "Cat" ? "🐱" : "🐦"} ${detectedAnimal} detected - ${detectedEmotion}`;
              
              setTranslations(prev => [...prev.filter(m => !m.isLoading), { 
                text: quickMessage, 
                time: new Date().toLocaleTimeString(), 
                id: Date.now(),
                animal: detectedAnimal,
                emotion: detectedEmotion,
                isQuick: true
              }].slice(-5));
              
              const video = videoRef.current;
              const canvas = canvasRef.current;
              if (video && video.videoWidth > 0 && video.videoHeight > 0) {
                 canvas.width = video.videoWidth;
                 canvas.height = video.videoHeight;
                 canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
                 const base64Image = canvas.toDataURL("image/jpeg", 0.5).split(',')[1]; // Reduced quality for speed
                 
                 const visionRes = await fetch("${API_URL}/api/analyze-vision", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      image: base64Image, 
                      emotion: detectedEmotion,
                      animal: detectedAnimal 
                    })
                 });
                 
                 if (visionRes.ok) {
                    const visionData = await visionRes.json();
                    if (visionData.translation) {
                      setTranslations(prev => [...prev, { 
                        text: visionData.translation, 
                        time: new Date().toLocaleTimeString(), 
                        id: Date.now(),
                        animal: detectedAnimal,
                        emotion: detectedEmotion
                      }].slice(-5)); 
                    }
                 }
              }
            }
          } catch (err) {
            console.error(err);
            setTranslations(prev => [...prev.filter(m => !m.isLoading), { 
              text: "❌ Connection error - Check if backend is running", 
              time: new Date().toLocaleTimeString(), 
              id: Date.now() 
            }].slice(-5));
          } finally {
            isProcessing = false;
          }
        }, 3000); // Reduced from 4000ms to 3000ms for faster updates
        return () => clearInterval(interval);
    }

    // New Flow: Custom Audio Model Listening
    let isProcessingSnapshot = false;
    const startListening = async () => {
        try {
            await recognizer.listen(async (result) => {
                const scores = result.scores;
                const labels = recognizer.wordLabels();
                let maxScore = 0;
                let maxLabel = "";
                
                for (let i = 0; i < labels.length; i++) {
                    if (scores[i] > maxScore) {
                        maxScore = scores[i];
                        maxLabel = labels[i];
                    }
                }

                // If probability high and not just background noise
                if (maxScore > 0.85 && maxLabel !== "Background Noise" && !isProcessingSnapshot) {
                    isProcessingSnapshot = true;
                    setAnimalDetected(maxLabel);
                    setMood("Excited"); // Vibe shifts when bark detected

                    const video = videoRef.current;
                    const canvas = canvasRef.current;
                    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        const ctx = canvas.getContext("2d");
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        
                        const base64Image = canvas.toDataURL("image/jpeg", 0.7).split(',')[1];
                        try {
                            const visionRes = await fetch("${API_URL}/api/analyze-vision", {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ image: base64Image, emotion: maxLabel + " Alert" })
                            });
                            
                            if (visionRes.ok) {
                                const visionData = await visionRes.json();
                                if (visionData.translation) {
                                    setTranslations(prev => [
                                      ...prev, 
                                      { text: `[${maxLabel}] ` + visionData.translation, time: new Date().toLocaleTimeString(), id: Date.now() }
                                    ].slice(-5)); 
                                }
                            }
                        } catch (err) {
                            console.error("API Error", err);
                        }
                    }
                    setTimeout(() => { isProcessingSnapshot = false; }, 4000);
                }
            }, {
                probabilityThreshold: 0.85,
                invokeCallbackOnNoiseAndUnknown: true,
                overlapFactor: 0.50
            });
        } catch (err) {
            console.error("TM Listen error:", err);
        }
    };

    startListening();

    return () => {
        if (recognizer && recognizer.isListening()) {
            recognizer.stopListening();
        }
    };
  }, [isRecording, micEnabled, uploadedMedia, recognizer]);

  useEffect(() => {
    return () => {
        if (streamRef.current) {
           streamRef.current.getTracks().forEach(t => t.stop());
        }
    };
  }, []);

  const AnimalIcon = () => {
    switch (animalDetected.toLowerCase()) {
      case 'dog': return <Dog className="w-8 h-8 text-cyan-300 drop-shadow-[0_0_8px_rgba(103,232,249,0.8)]" />;
      case 'cat': return <Cat className="w-8 h-8 text-pink-300 drop-shadow-[0_0_8px_rgba(244,114,182,0.8)]" />;
      case 'bird': return <Bird className="w-8 h-8 text-yellow-300 drop-shadow-[0_0_8px_rgba(253,224,71,0.8)]" />;
      default: return <HelpCircle className="w-8 h-8 text-white/50" />;
    }
  };

  const bgColor = MOOD_COLORS[mood] || MOOD_COLORS['Default'];

  return (
    <div className={`min-h-screen w-full flex items-center justify-center p-4 transition-colors duration-1000 bg-gradient-to-br ${bgColor} bg-[length:400%_400%] animate-gradient-slow relative overflow-hidden`}>
      <canvas ref={canvasRef} className="hidden" />
      <input 
        type="file" 
        id="media-upload" 
        className="hidden" 
        accept="image/*,video/*,audio/*" 
        onChange={handleFileUpload} 
      />
      
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-white/5 blur-[120px]" />
        <div className="absolute bottom-[10%] -right-[10%] w-[60%] h-[60%] rounded-full bg-white/5 blur-[120px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full max-w-6xl h-[85vh] rounded-3xl backdrop-blur-2xl bg-white/5 border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.4)] flex flex-col relative z-10 overflow-hidden text-white"
      >
        <div className="flex-1 flex flex-col md:flex-row p-6 gap-6 overflow-hidden">
          
          <div className="flex-1 rounded-2xl bg-black/40 border border-white/10 relative overflow-hidden group flex items-center justify-center shadow-inner">
            
            {uploadedMedia?.type === 'image' ? (
                <img src={uploadedMedia.url} className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 opacity-100" />
            ) : uploadedMedia?.type === 'audio' ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 transition-opacity duration-700 opacity-100 w-full h-full z-10">
                    <Music className="w-24 h-24 text-purple-400 animate-bounce drop-shadow-[0_0_15px_rgba(168,85,247,0.8)]" />
                    <p className="mt-6 text-purple-200 tracking-widest uppercase font-medium">Playing Audio</p>
                    <audio src={uploadedMedia.url} autoPlay loop controls className="mt-4 max-w-xs" />
                </div>
            ) : (
                <video 
                  ref={videoRef}
                  autoPlay 
                  playsInline 
                  loop={uploadedMedia?.type === 'video'}
                  muted 
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${(isRecording || uploadedMedia?.type === 'video') ? 'opacity-100' : 'opacity-0'}`} 
                />
            )}
            
            <div className="absolute inset-0 z-20 pointer-events-none">
               {(isRecording || uploadedMedia?.type === 'image') && (
                 <motion.div 
                   animate={{ y: ["0%", "100%", "0%"] }}
                   transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                   className="w-full h-1 bg-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.8)]"
                 />
               )}
            </div>
            
            <div className="z-10 absolute top-4 left-4 flex gap-2">
              <div className="bg-black/40 backdrop-blur-xl rounded-full px-4 py-2 border border-white/10 flex items-center gap-2 shadow-[0_0_10px_rgba(0,0,0,0.3)]">
                <span className={`w-2 h-2 rounded-full ${(isRecording || uploadedMedia?.type === 'image') ? 'bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]' : typeof uploadedMedia?.type === 'audio' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]' : 'bg-white/20'}`} />
                <span className="text-[10px] md:text-xs uppercase tracking-widest text-white/70">{(isRecording || uploadedMedia) ? (uploadedMedia ? 'Media Upload' : 'Live Scan') : 'Offline'}</span>
              </div>
              {(isRecording || uploadedMedia?.type === 'image') && (
                <div className="bg-black/40 backdrop-blur-xl rounded-full px-4 py-2 border border-white/10 flex items-center gap-2 shadow-[0_0_10px_rgba(0,0,0,0.3)]">
                  <span className="text-[10px] md:text-xs uppercase tracking-widest text-white/90">{mood}</span>
                </div>
              )}
            </div>

            {(isRecording || uploadedMedia?.type === 'image') && (
              <div className="z-10 absolute top-4 right-4 bg-white/5 backdrop-blur-xl rounded-2xl p-3 border border-white/10 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                 <AnimalIcon />
              </div>
            )}
            
            {!(isRecording || uploadedMedia) && <p className="text-white/30 tracking-widest uppercase text-sm font-light z-10 w-full text-center">System Standby</p>}
          </div>

          <div className="w-full md:w-[400px] flex flex-col gap-4 h-full shrink-0">
            <div className="flex-[0_1_auto] min-h-0 rounded-2xl bg-black/40 border border-white/10 p-6 overflow-y-auto flex flex-col gap-4 custom-scrollbar relative shadow-inner">
              <h2 className="text-xl font-light text-cyan-100/90 mb-2 border-b border-white/10 pb-4 flex items-center gap-2 sticky top-0 bg-black/20 backdrop-blur-md z-10 pt-2 -mt-2">
                <Activity className="w-5 h-5 text-cyan-400" />
                Translation Feed
              </h2>
              
              <div className="flex flex-col justify-end gap-4 min-h-full">
                <AnimatePresence>
                  {translations.map((msg, idx) => {
                    const isLatest = idx === translations.length - 1;
                    return (
                    <motion.div 
                      key={msg.id}
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className={`rounded-xl p-4 transition-all duration-500 ${
                        isLatest
                          ? 'bg-purple-500/10 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.15)]' 
                          : 'bg-white/5 border border-white/5 opacity-50'
                      }`}
                    >
                      <p className={`font-medium tracking-wide text-sm md:text-base ${
                        isLatest 
                          ? 'text-purple-100 drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]' 
                          : 'text-white/60'
                      }`}>
                        {isLatest ? <TypewriterText text={msg.text} /> : msg.text}
                      </p>
                      <span className="text-[10px] text-white/30 tracking-widest uppercase mt-3 block">{msg.time} • {uploadedMedia?.type === 'audio' ? 'Recorded' : animalDetected} Intent</span>
                    </motion.div>
                  )})}
                </AnimatePresence>
              </div>
            </div>

            <div className="h-24 md:h-32 shrink-0 rounded-2xl bg-black/50 border border-white/10 p-4 relative overflow-hidden flex items-end justify-center gap-[2px] md:gap-[3px] shadow-inner">
               <div className="absolute top-3 left-4 flex items-center gap-2">
                 <Mic className={`w-3 h-3 ${(isRecording || uploadedMedia) && micEnabled ? 'text-green-400' : 'text-white/30'}`} />
                 <span className="text-[10px] text-white/40 tracking-widest uppercase">Biometric Audio</span>
               </div>
               {audioData.map((height, i) => (
                 <motion.div
                   key={i}
                   animate={{ height: `${height}%` }}
                   transition={{ type: "spring", bounce: 0, duration: 0.1 }}
                   className={`w-[6px] md:w-[8px] rounded-t-[2px] ${(isRecording || uploadedMedia) && micEnabled ? 'bg-cyan-400/90 shadow-[0_0_10px_rgba(34,211,238,0.6)]' : 'bg-white/10'}`}
                 />
               ))}
            </div>
          </div>
        </div>

        <div className="h-20 md:h-24 shrink-0 border-t border-white/10 bg-black/20 backdrop-blur-md flex items-center justify-center gap-6 md:gap-8 px-6">
          
          <button 
            onClick={() => document.getElementById('media-upload').click()}
            className="flex items-center justify-center text-white/40 hover:text-white transition-all group"
          >
            <div className="p-4 rounded-full bg-white/5 border border-white/10 group-hover:bg-cyan-500/20 group-hover:border-cyan-500/30 group-hover:text-cyan-300 transition-all">
              <Upload className="w-5 h-5 md:w-6 md:h-6" />
            </div>
          </button>
          
          <button 
            onClick={toggleMic}
            disabled={!isRecording && !uploadedMedia}
            className={`flex items-center justify-center transition-all group ${!(isRecording || uploadedMedia) ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className={`p-4 rounded-full border transition-all ${(isRecording || uploadedMedia) && micEnabled ? 'bg-white/10 border-white/20 hover:bg-white/20 text-white' : 'bg-black/40 border-white/5 text-white/40 hover:text-white/70'}`}>
              {micEnabled ? <Mic className="w-5 h-5 md:w-6 md:h-6" /> : <MicOff className="w-5 h-5 md:w-6 md:h-6" />}
            </div>
          </button>

          <button 
            onClick={toggleCamera}
            className="flex items-center justify-center transition-all group"
          >
            <div className={`p-5 rounded-full border transition-all scale-110 ${(isRecording || uploadedMedia) ? 'bg-red-500/20 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.4)] text-red-400 hover:bg-red-500/30' : 'bg-cyan-500/20 border-cyan-500/30 hover:bg-cyan-500/30 text-cyan-300 hover:shadow-[0_0_20px_rgba(34,211,238,0.3)]'}`}>
              {(isRecording || uploadedMedia) ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            </div>
          </button>
          
          <button className="flex items-center justify-center text-white/40 hover:text-white transition-all group">
            <div className="p-4 rounded-full bg-white/5 border border-white/10 group-hover:bg-white/10 transition-all">
              <History className="w-5 h-5 md:w-6 md:h-6" />
            </div>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
