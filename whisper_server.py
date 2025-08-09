#!/usr/bin/env python3
"""
Whisper ASR Server for Voice Navigator Plugin
Provides speech-to-text transcription using OpenAI Whisper
"""

import os
import uuid  # Import uuid for generating unique filenames
import whisper
from flask import Flask, request, jsonify
from flask_cors import CORS
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Load Whisper model (using base model for balance of speed and accuracy)
logger.info("Loading Whisper model...")
model = whisper.load_model("base")
logger.info("Whisper model loaded successfully")


@app.route("/transcribe", methods=["POST"])
def transcribe_audio():
    """
    Transcribe audio file using Whisper
    """
    temp_filename = None  # Initialize temp_filename to None
    try:
        if "audio" not in request.files:
            logger.info(f"No audio file provided: {temp_filename}")
            return jsonify({"error": "No audio file provided"}), 400

        audio_file = request.files["audio"]

        if audio_file.filename == "":
            logger.info(f"No audio file selected: {temp_filename}")
            return jsonify({"error": "No audio file selected"}), 400

        # Generate a unique filename and save the uploaded file in the current directory
        unique_filename = str(uuid.uuid4()) + ".wav"
        temp_filename = os.path.join(os.getcwd(), unique_filename)
        logger.info(f"Saving audio file to: {temp_filename}")
        audio_file.save(temp_filename)
        logger.info(f"Audio file saved to: {temp_filename}")

        # Transcribe the audio
        logger.info(f"Transcribing audio file: {temp_filename}")
        result = model.transcribe(temp_filename)
        text = result["text"].strip()

        logger.info(f"Transcription result: {text}")

        return jsonify({"text": text, "language": result.get("language", "unknown")})

    except Exception as e:
        logger.error(f"Error during transcription: {str(e)}")
        return jsonify({"error": str(e)}), 500

    # finally:
    #     # Clean up temporary file if it was created
    #     if temp_filename and os.path.exists(temp_filename):
    #         os.unlink(temp_filename)
    #         logger.info(f"Temporary file deleted: {temp_filename}")

@app.route("/health", methods=["GET"])
def health_check():
    """
    Health check endpoint
    """
    return jsonify({"status": "healthy", "model": "whisper-base"})


if __name__ == "__main__":
    logger.info("Starting Whisper ASR server...")
    app.run(host="0.0.0.0", port=5000, debug=False)
