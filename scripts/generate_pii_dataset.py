"""
Dataset Generator for Local Qwen2.5 PII Redaction Training
Generates ChatML-formatted jsonl training dataset for Qwen fine-tuning.
"""

import json
import os
import random

# Synthetic PII data pools
FIRST_NAMES = ["Alex", "John", "Sarah", "Priya", "Rahul", "Emily", "David", "Vikram", "Maria"]
LAST_NAMES = ["Smith", "Sharma", "Doe", "Patel", "Johnson", "Gupta", "Williams", "Kumar"]
DOMAINS = ["gmail.com", "yahoo.com", "company.org", "outlook.com", "domain.in"]
STREETS = ["742 Evergreen Terrace", "10 Baker Street", "Park Avenue, Flat 4B", "MG Road, Block C"]
CITIES = ["New York", "Mumbai", "London", "Bengaluru", "San Francisco", "Delhi"]

def generate_synthetic_sample():
    first = random.choice(FIRST_NAMES)
    last = random.choice(LAST_NAMES)
    email = f"{first.lower()}.{last.lower()}@{random.choice(DOMAINS)}"
    phone = f"+{random.randint(1, 91)} {random.randint(700, 999)}-{random.randint(100, 999)}-{random.randint(1000, 9999)}"
    ssn = f"{random.randint(100, 999)}-{random.randint(10, 99)}-{random.randint(1000, 9999)}"
    pan = f"{''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ', k=5))}{random.randint(1000, 9999)}{random.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZ')}"
    card = f"4{random.randint(1000, 9999)}{random.randint(1000, 9999)}{random.randint(1000, 9999)}"
    address = f"{random.choice(STREETS)}, {random.choice(CITIES)}"

    patterns = [
        {
            "raw": f"User account details: Name: {first} {last}, Email: {email}, Phone: {phone}, SSN: {ssn}.",
            "sanitized": f"User account details: Name: {first} {last}, Email: [REDACTED_EMAIL], Phone: [REDACTED_PHONE], SSN: [REDACTED_SSN]."
        },
        {
            "raw": f"Shipping address for order: {address}. Contact phone {phone}. Payment card: {card}.",
            "sanitized": f"Shipping address for order: [REDACTED_ADDRESS]. Contact phone [REDACTED_PHONE]. Payment card: [REDACTED_CARD]."
        },
        {
            "raw": f"KYC Verification Document: PAN Card {pan}, Aadhaar User Email {email}.",
            "sanitized": f"KYC Verification Document: PAN Card [REDACTED_PAN], Aadhaar User Email [REDACTED_EMAIL]."
        },
        {
            "raw": f"Contact form submission from {email}: Please call back at {phone}.",
            "sanitized": f"Contact form submission from [REDACTED_EMAIL]: Please call back at [REDACTED_PHONE]."
        }
    ]

    return random.choice(patterns)

def build_chatml_dataset(output_file="data/pii_train.jsonl", num_samples=500):
    os.makedirs("data", exist_ok=True)
    
    system_prompt = "You are a local privacy preservation engine. Your task is to detect and sanitize all sensitive PII information (emails, phone numbers, SSNs, credit cards, exact addresses) from the input text, replacing them with standard redaction tokens."

    with open(output_file, "w", encoding="utf-8") as f:
        for _ in range(num_samples):
            sample = generate_synthetic_sample()
            chat_item = {
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Sanitize text:\n{sample['raw']}"},
                    {"role": "assistant", "content": sample["sanitized"]}
                ]
            }
            f.write(json.dumps(chat_item) + "\n")

    print(f"✅ Generated {num_samples} training samples in '{output_file}'")

if __name__ == "__main__":
    build_chatml_dataset()
