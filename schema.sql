-- SQL Schema for Philly Car Rentals Database
-- This file defines the SQL equivalent of the Firestore NoSQL structure
-- for reference, migrations, or local development with a SQL engine.

-- Customers Table
CREATE TABLE customers (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(200) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    address TEXT NOT NULL,
    driver_license_url TEXT,
    insurance_url TEXT,
    signature_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Vehicles Table
CREATE TABLE vehicles (
    plate_number VARCHAR(20) PRIMARY KEY,
    make VARCHAR(50) NOT NULL,
    model VARCHAR(50) NOT NULL,
    year INTEGER,
    color VARCHAR(30),
    status VARCHAR(20) CHECK (status IN ('available', 'rented', 'maintenance')) DEFAULT 'available',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Rentals Table
CREATE TABLE rentals (
    id VARCHAR(128) PRIMARY KEY,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    customer_name VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(200),
    dob DATE,
    street_address TEXT,
    city VARCHAR(100),
    state VARCHAR(20),
    postal_code VARCHAR(20),
    vehicle VARCHAR(100),
    plate_number VARCHAR(20) NOT NULL REFERENCES vehicles(plate_number),
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    submission_id VARCHAR(128),
    status VARCHAR(20) CHECK (status IN ('active', 'completed', 'pending', 'cancelled')) DEFAULT 'pending',
    license_file TEXT,
    selfie_file TEXT,
    insurance_file TEXT,
    signature_file TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tickets Table
CREATE TABLE tickets (
    id VARCHAR(128) PRIMARY KEY,
    plate_number VARCHAR(20) NOT NULL REFERENCES vehicles(plate_number),
    violation_date TIMESTAMP WITH TIME ZONE NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    matched_customer VARCHAR(200),
    rental_id VARCHAR(128) REFERENCES rentals(id),
    status VARCHAR(20) CHECK (status IN ('unpaid', 'paid', 'contested')) DEFAULT 'unpaid',
    ticket_image TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Notes Table (unified for both Rentals and Tickets)
CREATE TABLE notes (
    id VARCHAR(128) PRIMARY KEY,
    parent_id VARCHAR(128) NOT NULL, -- references either rentals(id) or tickets(id)
    parent_type VARCHAR(20) CHECK (parent_type IN ('rental', 'ticket')),
    text TEXT NOT NULL,
    author VARCHAR(100) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_rentals_plate ON rentals(plate_number);
CREATE INDEX idx_tickets_plate ON tickets(plate_number);
CREATE INDEX idx_tickets_rental ON tickets(rental_id);
CREATE INDEX idx_notes_parent ON notes(parent_id);
