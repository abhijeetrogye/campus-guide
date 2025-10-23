# data.py
import os
import google.generativeai as genai
from dotenv import load_dotenv
from typing import List, Dict, Optional
import database
import re

# Load environment variables
load_dotenv()
# Make sure to set your GEMINI_API_KEY in a .env file
# GEMINI_API_KEY="YOUR_API_KEY_HERE"
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# A mapping for more natural language names in the prompt
LANGUAGE_MAP = {
    'en': 'English',
    'hi': 'Hindi',
    'mr': 'Marathi',
    'es': 'Spanish',
    'fr': 'French'
}

def get_ai_response(user_query: str, history: List[Dict[str, str]], target_lang: str) -> Dict[str, Optional[str]]:
    """
    Handles response generation, including rule-based checks and translation via Gemini.
    """
    query_lower = user_query.lower()
    map_url = None
    college_info = database.get_college_info()
    language_name = LANGUAGE_MAP.get(target_lang, 'English')  # Default to English

    # --- Rule-Based Database Checks ---
    # Location queries
    if "where is" in query_lower or "location of" in query_lower or "find the" in query_lower:
        # Extract the place name from the user query
        potential_place = re.split(r'where is|location of|find the', user_query, flags=re.IGNORECASE)[-1].replace("?", "").strip()
        location = database.find_location(potential_place)
        
        if location:
            # If a location is found, set the map URL
            if college_info and college_info.get('map_url'):
                map_url = college_info['map_url']
            
            # --- EFFICIENT TRANSLATION FIX ---
            # Instead of a second API call, create a prompt for Gemini to answer directly in the target language.
            generative_prompt = f"""
            You are a helpful campus assistant.
            A user asked for the location of "{location['name']}".
            The details for this location are: "{location['details']}".
            Please formulate a helpful and concise response in this language: {language_name}.
            """
            try:
                model = genai.GenerativeModel("gemini-2.5-flash") # Using a modern model
                response = model.generate_content(generative_prompt)
                return {"responseText": response.text.strip(), "mapUrl": map_url}
            except Exception as e:
                print(f"Error calling Gemini API for location query: {e}")
                # Fallback to the general prompt if the specific one fails
                pass


    # --- If no specific rule matches, use Gemini for a comprehensive answer ---
    campus_data = database.get_all_data_for_prompt()
    formatted_history = "\n".join([f"{msg['role'].capitalize()}: {msg['content']}" for msg in history])

    # Enhanced general prompt
    prompt = f"""
    You are CampusGuide AI, an intelligent assistant for {college_info.get('name', 'the college')}.
    Your primary goal is to provide concise, accurate, and friendly information to students and visitors.
    You MUST respond in the following language: {language_name}.

    **IMPORTANT ESCALATION RULE**:
    If you absolutely cannot answer the user's question with the provided database information,
    or if the user seems frustrated, your ONLY response MUST be this exact English phrase:
    `I am unable to answer your question. Would you like to talk to a person?`
    Do not translate this specific phrase. Do not add any other text.

    Current User Query: "{user_query}"

    Use the following database information to answer the query if relevant:
    {campus_data}

    Conversation History (for context):
    {formatted_history}

    Your Answer (in {language_name}, unless the escalation rule applies):
    """

    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content(prompt)
        # Final safety check for escalation phrase in case the model adds extra text
        if "Would you like to talk to a person?" in response.text:
             return {"responseText": "I am unable to answer your question. Would you like to talk to a person?", "mapUrl": None}
        return {"responseText": response.text.strip(), "mapUrl": map_url}
    except Exception as e:
        print(f"Error calling Gemini API: {e}")
        return {"responseText": "I'm sorry, I'm having trouble connecting to my brain right now. Please try again in a moment.", "mapUrl": None}