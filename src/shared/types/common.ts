export enum ServiceType {
    FACE_TO_FACE = 'Face-to-Face',
    VIDEO = 'Video Call',
    TELEPHONE = 'Telephone',
    TRANSLATION = 'Translation',
    BSL = 'British Sign Language'
}

export enum AssignmentStatus {
    OFFERED = 'OFFERED',
    ACCEPTED = 'ACCEPTED',
    DECLINED = 'DECLINED',
    REMOVED = 'REMOVED',
    EXPIRED = 'EXPIRED'
}

export interface GuestContact {
    name: string;
    organisation: string;
    email: string;
    phone: string;
    billingEmail?: string;
    gdprConsent?: boolean;
    agreedToTerms?: boolean;
    patientName?: string;
    professionalName?: string;
}

export type Currency = string;
