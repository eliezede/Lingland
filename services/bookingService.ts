
// Redirecting to the main Mock API service to prevent Firestore errors in this demo environment
import { BookingService as MockBookingService } from "./api";

export const BookingService = MockBookingService;
