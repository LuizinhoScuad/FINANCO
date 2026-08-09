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

/**
 * Envia o comprovante para `receipts/{uid}/...`.
 *
 * O caminho precisa começar com o próprio uid: é o que as regras do Storage
 * verificam. `subpasta` separa despesas de ressarcimento dos recibos das
 * transações pessoais, sem sair do escopo permitido.
 */
export async function uploadReceipt(file: File, subpasta?: string): Promise<string> {
    const uid = await waitForAuth();

    if (!file.type.startsWith("image/")) {
        throw new Error("Envie uma imagem.");
    }
    if (file.size > 10 * 1024 * 1024) {
        throw new Error("Imagem maior que 10 MB.");
    }

    const storage = getStorage(getApp());
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const caminho = subpasta
        ? `receipts/${uid}/${subpasta}/${Date.now()}.${ext}`
        : `receipts/${uid}/${Date.now()}.${ext}`;

    const storageRef = ref(storage, caminho);
    await uploadBytes(storageRef, file, { contentType: file.type });
    return getDownloadURL(storageRef);
}
