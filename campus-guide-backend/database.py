# database.py
import sqlite3
import datetime
from typing import List, Dict, Any, Optional

DB_NAME = "campus.db"

def _execute_query(query: str, params: tuple = (), fetch_one: bool = False, commit: bool = False) -> Any:
    """Helper function to execute a query with robust connection handling."""
    data = None
    try:
        with sqlite3.connect(DB_NAME) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(query, params)
            
            if commit:
                conn.commit()
            elif fetch_one:
                result = cursor.fetchone()
                data = dict(result) if result else None
            else:
                results = cursor.fetchall()
                data = [dict(row) for row in results]
    except sqlite3.Error as e:
        print(f"Database error: {e}")
        # Depending on the application's needs, you might want to raise the exception
        # or return a default value like None or an empty list.
        return None if fetch_one or commit else []
        
    return data

def get_college_info() -> Optional[Dict[str, Any]]:
    """Fetches general information about the college."""
    return _execute_query("SELECT * FROM college_info WHERE id = 1", fetch_one=True)

def find_location(place_name: str) -> Optional[Dict[str, Any]]:
    """Finds a location by name."""
    query = "SELECT * FROM locations WHERE name LIKE ?"
    results = _execute_query(query, (f"%{place_name}%",))
    return results[0] if results else None

def find_faculty(faculty_name: str) -> Optional[Dict[str, Any]]:
    """Finds a faculty member by name."""
    query = "SELECT * FROM faculty WHERE name LIKE ?"
    results = _execute_query(query, (f"%{faculty_name}%",))
    return results[0] if results else None

def find_course(course_query: str) -> Optional[Dict[str, Any]]:
    """Finds a course by its code or name."""
    query = "SELECT * FROM courses WHERE code LIKE ? OR name LIKE ?"
    params = (f"%{course_query}%", f"%{course_query}%")
    results = _execute_query(query, params)
    return results[0] if results else None

def get_upcoming_events() -> List[Dict[str, Any]]:
    """Fetches all events scheduled for today or later."""
    today_str = datetime.date.today().isoformat()
    query = "SELECT * FROM events WHERE date >= ? ORDER BY date ASC"
    return _execute_query(query, (today_str,))

def get_all_data_for_prompt() -> Dict[str, Any]:
    """Fetches all data from the DB to be used as context for the Gemini prompt."""
    return {
        "college_info": get_college_info(),
        "locations": _execute_query("SELECT * FROM locations"),
        "faculty": _execute_query("SELECT * FROM faculty"),
        "events": _execute_query("SELECT * FROM events"),
        "courses": _execute_query("SELECT * FROM courses"),
    }

def save_feedback(session_id: str, rating: Optional[int], comment: Optional[str]):
    """Saves user feedback for a live chat session."""
    query = "INSERT INTO live_chat_feedback (session_id, rating, comment) VALUES (?, ?, ?)"
    _execute_query(query, (session_id, rating, comment), commit=True)