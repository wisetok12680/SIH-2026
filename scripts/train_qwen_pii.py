"""
Fine-tuning script for Qwen2.5-0.5B-Instruct using QLoRA / PEFT.
Optimized for running locally on consumer hardware.
"""

import torch
from datasets import load_dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    BitsAndBytesConfig
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from trl import SFTTrainer

MODEL_ID = "Qwen/Qwen2.5-0.5B-Instruct"
DATASET_PATH = "data/pii_train.jsonl"
OUTPUT_DIR = "models/qwen2.5-0.5b-pii-lora"

def train():
    print(f"🚀 Loading base model: {MODEL_ID}")

    # 1. 4-bit Quantization Config for low VRAM
    quantization_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True
    )

    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        quantization_config=quantization_config,
        device_map="auto",
        trust_remote_code=True
    )
    model = prepare_model_for_kbit_training(model)

    # 2. LoRA Config
    peft_config = LoraConfig(
        r=16,
        lora_alpha=32,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM"
    )

    model = get_peft_model(model, peft_config)
    model.print_trainable_parameters()

    # 3. Load Dataset
    dataset = load_dataset("json", data_files=DATASET_PATH, split="train")

    # 4. Training Parameters
    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        learning_rate=2e-4,
        logging_steps=10,
        max_steps=100,
        fp16=True,
        save_strategy="steps",
        save_steps=50,
        report_to="none"
    )

    trainer = SFTTrainer(
        model=model,
        train_dataset=dataset,
        peft_config=peft_config,
        dataset_text_field="messages",
        max_seq_length=512,
        tokenizer=tokenizer,
        args=training_args
    )

    print("⚡ Starting QLoRA Fine-Tuning...")
    trainer.train()

    print(f"✅ Training Complete! Model saved to '{OUTPUT_DIR}'")
    model.save_pretrained(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)

if __name__ == "__main__":
    train()
