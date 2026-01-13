# Portal

Nowoczesny portal webowy, który integruje wiele narzędzi w jednym wygodnym interfejsie:
1. **Notatnik Ciśnienia (BP Log)**: Rejestrowanie ciśnienia, pulsu, leków i wydarzeń ze zdrowiem (z synchronizacją w chmurze i udostępnianiem).
2. **Panel Gmail**: Podgląd ilości nieprzeczytanych wiadomości oraz ich treści z poziomu portalu.

Aplikacja działa jako serwer Node.js z frontendem HTML/JS i wykorzystuje **Vercel KV (Redis)** do bezpiecznego przechowywania danych oraz tokenów.

## Główne Funkcje

### 1. Notatnik Ciśnienia (BP Log)
- **Zapis Danych**: Dodawanie wpisów z ciśnieniem, pulsem, wagą, lekami i notatkami.
- **Wykresy**: Wizualizacja pomiarów na wykresie SVG (Systolic, Diastolic, Puls).
- **Synchronizacja w Chmurze**: Twoje dane są automatycznie zapisywane w **Vercel KV**, dzięki czemu masz do nich dostęp na dowolnym urządzeniu (wymaga logowania tym samym mailem).
- **Udostępnianie**: Możesz bezpiecznie udostępnić swoje wyniki innej osobie (np. lekarzowi lub członkowi rodziny) w trybie "tylko do odczytu". Zarządzasz listą dostępów w zakładce *Ustawienia*.
- **Lista Leków**: Definiowanie własnej listy leków z dawkami, które potem łatwo "odklikać" przy dodawaniu wpisu.

### 2. Panel Gmail
- Podgląd licznika nieprzeczytanych wiadomości.
- Lista ostatnich e-maili z podglądem treści.
- Szybkie akcje: oznacz jako przeczytane, usuń.

## Instalacja i Uruchomienie

### Wymagania
- Node.js (v18+)
- Konto Google (dla OAuth)
- Konto Vercel (opcjonalnie dla bazy KV)

### 1. Instalacja Zależności
```bash
npm install
```

### 2. Konfiguracja (.env)
Stwórz plik `.env` na podstawie `.env.example` i uzupełnij go.

**Wymagane dla Google OAuth:**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URL`

**Wymagane dla Bazy Danych (Synchronizacja):**
- `KV_REST_API_URL` (URL z Upstash/Vercel)
- `KV_REST_API_TOKEN` (Token dostępu)

### 3. Uruchomienie Serwera
```bash
npm start
# Server runs at http://localhost:3000
```

## Praca w Chmurze (Vercel)
Projekt jest przystosowany do wdrożenia na Vercel (Serverless).
- Upewnij się, że w panelu Vercel dodałeś zmienne środowiskowe (`KV_REST_API_URL` itd.).
- Aplikacja automatycznie wykrywa środowisko Vercel i dostosowuje ścieżki (np. do ciasteczek).

## Bezpieczeństwo
- **Logowanie**: Dostęp do portalu jest chroniony przez Google OAuth.
- **Izolacja Danych**: Każdy użytkownik widzi tylko swoje wpisy (chyba że ktoś mu je udostępni).
- **Tokeny**: Tokeny dostępowe (Gmail) są szyfrowane i przechowywane bezpiecznie.

## Udostępnianie Danych
Aby udostępnić komuś swoje wyniki:
1. Wejdź w **Notatnik Ciśnienia -> Ustawienia** (ikona koła zębatego).
2. W sekcji "Udostępnianie" wpisz adres email osoby docelowej.
3. Ta osoba (musi również zalogować się do Portalu) zobaczy Twój email w sekcji "Dane udostępnione DLA Ciebie".
4. Kliknięcie w link otworzy Twój dziennik w trybie Read-Only.

---
*Created by Antigravity*
