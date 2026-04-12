"use client";

import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseAuth } from "@/lib/firebase-client";
import { getApp } from "firebase/app";

export async function uploadReceipt(file: File): Promise<string> {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) throw new Error("Usuário não autenticado.");

    const storage = getStorage(getApp());
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `receipts/${uid}/${Date.now()}.${ext}`;
    const storageRef = ref(storage, path);

    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
}
