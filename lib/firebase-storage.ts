"use client";

import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseAuth } from "@/lib/firebase-client";
import { getApp } from "firebase/app";

/** Aguarda o estado de autenticação ser resolvido (máx 5s) */
function waitForAuth(): Promise<string> {
    return new Promise((resolve, reject) => {
        if (firebaseAuth.currentUser?.uid) {
            return resolve(firebaseAuth.currentUser.uid);
        }
        const timer = setTimeout(() => {
            unsub();
            reject(new Error("Timeout aguardando autenticação."));
        }, 5000);
        const unsub = firebaseAuth.onAuthStateChanged((user) => {
            if (user?.uid) {
                clearTimeout(timer);
                unsub();
                resolve(user.uid);
            }
        });
    });
}

export async function uploadReceipt(file: File): Promise<string> {
    const uid = await waitForAuth();

    const storage = getStorage(getApp());
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `receipts/${uid}/${Date.now()}.${ext}`;
    const storageRef = ref(storage, path);

    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
}
