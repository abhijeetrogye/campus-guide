# setup_database.py
import sqlite3

def setup():
    """
    Creates the database tables and populates them with initial data.
    """
    conn = sqlite3.connect("campus.db")
    cursor = conn.cursor()

    print("Creating tables...")

    # College Info Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS college_info (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        map_url TEXT
    );
    """)

    # Locations Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        details TEXT NOT NULL
    );
    """)

    # Faculty Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS faculty (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        department TEXT NOT NULL,
        location TEXT NOT NULL,
        contact TEXT NOT NULL
    );
    """)
    
    # Events Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        venue TEXT NOT NULL,
        date TEXT NOT NULL,
        description TEXT NOT NULL
    );
    """)

    # Courses Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        department TEXT NOT NULL,
        instructor TEXT NOT NULL,
        description TEXT NOT NULL,
        credits INTEGER NOT NULL
    );
    """)

    # Live Chat Feedback Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS live_chat_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        rating INTEGER,
        comment TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    print("Populating initial data...")

    # College Info
    # IMPORTANT: Replace this URL with the correct "Embed a map" SRC URL from Google Maps for your location.
    college_data = (1, "St. John College of Engineering and Management", "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d...")
    cursor.execute("REPLACE INTO college_info (id, name, map_url) VALUES (?, ?, ?)", college_data)
    
    # Locations
    locations_data = [
        ("Engineering Building", "Go straight from the first gate, take a left, and enter the main entrance."),
        ("Admin Office", "Ground floor, near the main entrance of the Engineering Building."),
        ("Canteen", "Enter from the first gate, take a left, go straight, and you will find it."),
        ("Library", "Block A, near the Main Gate"),
        ("Mechanical Lab", "Block C, Room 204"),
        ("Computer Science Department", "Block B, 3rd Floor"),
    ]
    cursor.executemany("INSERT OR IGNORE INTO locations (name, details) VALUES (?, ?)", locations_data)

    # Faculty
    faculty_data = [
        ("Dr. Mehta", "Computer Science", "Room 305, Block B", "mehta.cse@sjcem.edu.in"),
        ("Prof. Rao", "Mechanical", "Room 210, Block C", "rao.mech@sjcem.edu.in"),
        ("Dr. Sharma", "Electronics", "Room 215, Block D", "sharma.elec@sjcem.edu.in"),
    ]
    cursor.executemany("INSERT OR IGNORE INTO faculty (name, department, location, contact) VALUES (?, ?, ?, ?)", faculty_data)
    
    # Events
    events_data = [
        ("Tech Fest 2025", "Main Auditorium", "2025-11-20", "A national-level technical festival with competitions, workshops, and guest lectures."),
        ("Cultural Night", "Open Grounds", "2025-12-05", "An evening filled with performances, music, and food stalls."),
    ]
    cursor.executemany("INSERT OR IGNORE INTO events (name, venue, date, description) VALUES (?, ?, ?, ?)", events_data)

    # Courses
    courses_data = [
        ("CS101", "Introduction to Programming", "Computer Science", "Dr. Mehta", "A foundational course on Python programming, data structures, and algorithms.", 4),
        ("ME203", "Thermodynamics", "Mechanical", "Prof. Rao", "Study of energy, heat, work, and the laws of thermodynamics.", 3),
        ("EC305", "Digital Circuits", "Electronics", "Dr. Sharma", "Design and analysis of digital electronic circuits.", 3),
    ]
    cursor.executemany("INSERT OR IGNORE INTO courses (code, name, department, instructor, description, credits) VALUES (?, ?, ?, ?, ?, ?)", courses_data)

    conn.commit()
    conn.close()
    print("✅ Database setup complete!")

if __name__ == "__main__":
    setup()