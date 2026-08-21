/* Platform numbers, filled in by hand.

   Nothing publishes these: no GTFS feed carries platform_code, and OSM's
   platform refs are not linked to a line or direction. So each value below is
   blank until someone confirms it on the platform sign.

   Key is feed:stopId:routeId:directionId. Leave a value as "" and the app falls
   the destination the platform is signed by, which is never wrong, just vaguer.

   Generated for 335 rail stations.
*/
window.RAPIDBUS_PLATFORMS = {

  /* ===== INTERCHANGE — wrong platform costs a walk ===== */
  // ABDULLAH HUKUM  (KJL)
  "rapid-rail-kl:KJ17:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ17:KJ:1": "", // KJL towards Putra Heights
  // ABDULLAH HUKUM  (Port Klang Line)
  "ktmb:52700:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:52700:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // ALOR SETAR  (Padang Besar Line, ETS)
  "ktmb:44000:100_47300:0": "", // Padang Besar Line towards PADANG BESAR
  "ktmb:44000:100_47300:1": "", // Padang Besar Line towards BUTTERWORTH
  "ktmb:44000:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:44000:ETS:1": "", // ETS towards JB SENTRAL
  // AMPANG PARK  (KJL)
  "rapid-rail-kl:KJ9:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ9:KJ:1": "", // KJL towards Putra Heights
  // AMPANG PARK  (PYL)
  "rapid-rail-kl:PY20:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY20:PYL:1": "", // PYL towards Kwasa Damansara
  // ANAK BUKIT  (Padang Besar Line, ETS)
  "ktmb:44400:100_47300:0": "", // Padang Besar Line towards PADANG BESAR
  "ktmb:44400:100_47300:1": "", // Padang Besar Line towards BUTTERWORTH
  "ktmb:44400:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:44400:ETS:1": "", // ETS towards JB SENTRAL
  // ARAU  (Padang Besar Line, ETS)
  "ktmb:45800:100_47300:0": "", // Padang Besar Line towards PADANG BESAR
  "ktmb:45800:100_47300:1": "", // Padang Besar Line towards BUTTERWORTH
  "ktmb:45800:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:45800:ETS:1": "", // ETS towards JB SENTRAL
  // BAGAN SERAI  (Ipoh Line, ETS)
  "ktmb:2600:100_9000:0": "", // Ipoh Line towards BUTTERWORTH
  "ktmb:2600:100_9000:1": "", // Ipoh Line towards IPOH
  "ktmb:2600:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:2600:ETS:1": "", // ETS towards JB SENTRAL
  // BANDAR UTAMA  (KGL)
  "rapid-rail-kl:KG09:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG09:KGL:1": "", // KGL towards Kwasa Damansara
  // BANDAR UTAMA  (SAL)
  "rapid-rail-kl:SA1:SA:0": "", // SAL towards Johan Setia
  "rapid-rail-kl:SA1:SA:1": "", // SAL towards Bandar Utama
  // BANDARAYA - UOB  (AGL)
  "rapid-rail-kl:AG6:AG:0": "", // AGL towards Sentul Timur
  "rapid-rail-kl:AG6:AG:1": "", // AGL towards Ampang
  // BANDARAYA - UOB  (SPL)
  "rapid-rail-kl:SP6:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP6:PH:1": "", // SPL towards Putra Heights
  // BANK NEGARA  (Seremban Line, Port Klang Line)
  "ktmb:18900:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:18900:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  "ktmb:18900:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:18900:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // BDR TASEK SELATAN  (Seremban Line, ETS)
  "ktmb:19600:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:19600:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  "ktmb:19600:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:19600:ETS:1": "", // ETS towards JB SENTRAL
  // BUKIT ABU  (SH, ERT)
  "ktmb:80000:SH:0": "", // SH towards TUMPAT
  "ktmb:80000:SH:1": "", // SH towards KUALA LIPIS
  "ktmb:80000:ERT:0": "", // ERT towards TUMPAT
  // BUKIT BINTANG  (KGL)
  "rapid-rail-kl:KG18A:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG18A:KGL:1": "", // KGL towards Kwasa Damansara
  // BUKIT BINTANG  (MRL)
  "rapid-rail-kl:MR6:MR:0": "", // MRL towards Titiwangsa
  "rapid-rail-kl:MR6:MR:1": "", // MRL towards KL Sentral
  // BUKIT MERTAJAM  (Padang Besar Line, Ipoh Line)
  "ktmb:600:100_47300:0": "", // Padang Besar Line towards PADANG BESAR
  "ktmb:600:100_47300:1": "", // Padang Besar Line towards BUTTERWORTH
  "ktmb:600:100_9000:0": "", // Ipoh Line towards BUTTERWORTH
  "ktmb:600:100_9000:1": "", // Ipoh Line towards IPOH
  // BUKIT TENGAH  (Padang Besar Line, Ipoh Line)
  "ktmb:400:100_47300:0": "", // Padang Besar Line towards PADANG BESAR
  "ktmb:400:100_47300:1": "", // Padang Besar Line towards BUTTERWORTH
  "ktmb:400:100_9000:0": "", // Ipoh Line towards BUTTERWORTH
  "ktmb:400:100_9000:1": "", // Ipoh Line towards IPOH
  // BUTTERWORTH  (Padang Besar Line, Ipoh Line)
  "ktmb:100:100_47300:0": "", // Padang Besar Line towards PADANG BESAR
  "ktmb:100:100_47300:1": "", // Padang Besar Line towards BUTTERWORTH
  "ktmb:100:100_9000:0": "", // Ipoh Line towards BUTTERWORTH
  "ktmb:100:100_9000:1": "", // Ipoh Line towards IPOH
  // CHAN SOW LIN  (AGL)
  "rapid-rail-kl:AG11:AG:0": "", // AGL towards Sentul Timur
  "rapid-rail-kl:AG11:AG:1": "", // AGL towards Ampang
  // CHAN SOW LIN  (SPL)
  "rapid-rail-kl:SP11:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP11:PH:1": "", // SPL towards Putra Heights
  // CHAN SOW LIN  (PYL)
  "rapid-rail-kl:PY24:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY24:PYL:1": "", // PYL towards Kwasa Damansara
  // CHEGAR PERAH  (SH, ERT)
  "ktmb:73100:SH:1": "", // SH towards KUALA LIPIS
  "ktmb:73100:ERT:1": "", // ERT towards JB SENTRAL
  // DABONG  (SH, ERT)
  "ktmb:79300:SH:0": "", // SH towards TUMPAT
  "ktmb:79300:SH:1": "", // SH towards KUALA LIPIS
  "ktmb:79300:ERT:0": "", // ERT towards TUMPAT
  "ktmb:79300:ERT:1": "", // ERT towards JB SENTRAL
  // GEMAS  (ETS, ERT)
  "ktmb:27800:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:27800:ETS:1": "", // ETS towards JB SENTRAL
  "ktmb:27800:ERT:0": "", // ERT towards TUMPAT
  "ktmb:27800:ERT:1": "", // ERT towards JB SENTRAL
  // GUA MUSANG  (SH, ERT)
  "ktmb:76000:SH:0": "", // SH towards TUMPAT
  "ktmb:76000:SH:1": "", // SH towards KUALA LIPIS
  "ktmb:76000:ERT:0": "", // ERT towards TUMPAT
  "ktmb:76000:ERT:1": "", // ERT towards JB SENTRAL
  // GURUN  (Padang Besar Line, ETS)
  "ktmb:42400:100_47300:0": "", // Padang Besar Line towards PADANG BESAR
  "ktmb:42400:100_47300:1": "", // Padang Besar Line towards BUTTERWORTH
  "ktmb:42400:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:42400:ETS:1": "", // ETS towards JB SENTRAL
  // HANG TUAH  (AGL)
  "rapid-rail-kl:AG9:AG:0": "", // AGL towards Sentul Timur
  "rapid-rail-kl:AG9:AG:1": "", // AGL towards Ampang
  // HANG TUAH  (SPL)
  "rapid-rail-kl:SP9:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP9:PH:1": "", // SPL towards Putra Heights
  // HANG TUAH  (MRL)
  "rapid-rail-kl:MR4:MR:0": "", // MRL towards Titiwangsa
  "rapid-rail-kl:MR4:MR:1": "", // MRL towards KL Sentral
  // IPOH  (Ipoh Line, ETS)
  "ktmb:9000:100_9000:0": "", // Ipoh Line towards BUTTERWORTH
  "ktmb:9000:100_9000:1": "", // Ipoh Line towards IPOH
  "ktmb:9000:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:9000:ETS:1": "", // ETS towards JB SENTRAL
  // JB SENTRAL  (Shuttle Selatan, ETS, ERT, ST)
  "ktmb:37500:SS:0": "", // Shuttle Selatan towards JB SENTRAL
  "ktmb:37500:SS:1": "", // Shuttle Selatan towards PALOH
  "ktmb:37500:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:37500:ETS:1": "", // ETS towards JB SENTRAL
  "ktmb:37500:ERT:0": "", // ERT towards TUMPAT
  "ktmb:37500:ERT:1": "", // ERT towards JB SENTRAL
  "ktmb:37500:ST:0": "", // ST towards JB SENTRAL
  "ktmb:37500:ST:1": "", // ST towards WOODLANDS CIQ
  // KAJANG  (KGL)
  "rapid-rail-kl:KG35:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG35:KGL:1": "", // KGL towards Kwasa Damansara
  // KAJANG  (Seremban Line, ETS)
  "ktmb:20400:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:20400:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  "ktmb:20400:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:20400:ETS:1": "", // ETS towards JB SENTRAL
  // KAMPUNG BATU  (PYL)
  "rapid-rail-kl:PY13:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY13:PYL:1": "", // PYL towards Kwasa Damansara
  // KAMPUNG BATU  (Seremban Line)
  "ktmb:50400:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:50400:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  // KEMPAS BARU  (Shuttle Selatan, ETS, ERT)
  "ktmb:36900:SS:0": "", // Shuttle Selatan towards JB SENTRAL
  "ktmb:36900:SS:1": "", // Shuttle Selatan towards PALOH
  "ktmb:36900:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:36900:ETS:1": "", // ETS towards JB SENTRAL
  "ktmb:36900:ERT:0": "", // ERT towards TUMPAT
  "ktmb:36900:ERT:1": "", // ERT towards JB SENTRAL
  // KL SENTRAL  (MRL)
  "rapid-rail-kl:MR1:MR:0": "", // MRL towards Titiwangsa
  "rapid-rail-kl:MR1:MR:1": "", // MRL towards KL Sentral
  // KL SENTRAL  (Seremban Line, Port Klang Line, ETS)
  "ktmb:19100:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:19100:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  "ktmb:19100:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:19100:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  "ktmb:19100:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:19100:ETS:1": "", // ETS towards JB SENTRAL
  // KLUANG  (Shuttle Selatan, ETS, ERT)
  "ktmb:33200:SS:0": "", // Shuttle Selatan towards JB SENTRAL
  "ktmb:33200:SS:1": "", // Shuttle Selatan towards PALOH
  "ktmb:33200:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:33200:ETS:1": "", // ETS towards JB SENTRAL
  "ktmb:33200:ERT:0": "", // ERT towards TUMPAT
  "ktmb:33200:ERT:1": "", // ERT towards JB SENTRAL
  // KRAI  (SH, ERT)
  "ktmb:82100:SH:0": "", // SH towards TUMPAT
  "ktmb:82100:SH:1": "", // SH towards KUALA LIPIS
  "ktmb:82100:ERT:0": "", // ERT towards TUMPAT
  "ktmb:82100:ERT:1": "", // ERT towards JB SENTRAL
  // KUALA KANGSAR  (Ipoh Line, ETS)
  "ktmb:6300:100_9000:0": "", // Ipoh Line towards BUTTERWORTH
  "ktmb:6300:100_9000:1": "", // Ipoh Line towards IPOH
  "ktmb:6300:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:6300:ETS:1": "", // ETS towards JB SENTRAL
  // KUALA LIPIS  (SH, ERT)
  "ktmb:71300:SH:1": "", // SH towards KUALA LIPIS
  "ktmb:71300:ERT:0": "", // ERT towards TUMPAT
  "ktmb:71300:ERT:1": "", // ERT towards JB SENTRAL
  // KUALA LUMPUR  (Seremban Line, Port Klang Line, ETS)
  "ktmb:19000:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:19000:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  "ktmb:19000:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:19000:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  "ktmb:19000:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:19000:ETS:1": "", // ETS towards JB SENTRAL
  // KULAI  (Shuttle Selatan, ETS, ERT)
  "ktmb:36000:SS:0": "", // Shuttle Selatan towards JB SENTRAL
  "ktmb:36000:SS:1": "", // Shuttle Selatan towards PALOH
  "ktmb:36000:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:36000:ETS:1": "", // ETS towards JB SENTRAL
  "ktmb:36000:ERT:0": "", // ERT towards TUMPAT
  "ktmb:36000:ERT:1": "", // ERT towards JB SENTRAL
  // KWASA DAMANSARA  (KGL)
  "rapid-rail-kl:KG04:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG04:KGL:1": "", // KGL towards Kwasa Damansara
  // KWASA DAMANSARA  (PYL)
  "rapid-rail-kl:PY01:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY01:PYL:1": "", // PYL towards Kwasa Damansara
  // LAYANG LAYANG  (Shuttle Selatan, ETS)
  "ktmb:34800:SS:0": "", // Shuttle Selatan towards JB SENTRAL
  "ktmb:34800:SS:1": "", // Shuttle Selatan towards PALOH
  "ktmb:34800:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:34800:ETS:1": "", // ETS towards JB SENTRAL
  // MALURI  (AGL)
  "rapid-rail-kl:AG13:AG:0": "", // AGL towards Sentul Timur
  "rapid-rail-kl:AG13:AG:1": "", // AGL towards Ampang
  // MALURI  (KGL)
  "rapid-rail-kl:KG22:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG22:KGL:1": "", // KGL towards Kwasa Damansara
  // MASJID JAMEK  (AGL)
  "rapid-rail-kl:AG7:AG:0": "", // AGL towards Sentul Timur
  "rapid-rail-kl:AG7:AG:1": "", // AGL towards Ampang
  // MASJID JAMEK  (KJL)
  "rapid-rail-kl:KJ13:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ13:KJ:1": "", // KJL towards Putra Heights
  // MASJID JAMEK  (SPL)
  "rapid-rail-kl:SP7:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP7:PH:1": "", // SPL towards Putra Heights
  // MERAPOH  (SH, ERT)
  "ktmb:74800:SH:1": "", // SH towards KUALA LIPIS
  "ktmb:74800:ERT:0": "", // ERT towards TUMPAT
  "ktmb:74800:ERT:1": "", // ERT towards JB SENTRAL
  // NIBONG TEBAL  (Ipoh Line, ETS)
  "ktmb:1700:100_9000:0": "", // Ipoh Line towards BUTTERWORTH
  "ktmb:1700:100_9000:1": "", // Ipoh Line towards IPOH
  "ktmb:1700:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:1700:ETS:1": "", // ETS towards JB SENTRAL
  // PADANG BESAR  (Padang Besar Line, ETS)
  "ktmb:47300:100_47300:0": "", // Padang Besar Line towards PADANG BESAR
  "ktmb:47300:100_47300:1": "", // Padang Besar Line towards BUTTERWORTH
  "ktmb:47300:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:47300:ETS:1": "", // ETS towards JB SENTRAL
  // PALOH  (Shuttle Selatan, ETS)
  "ktmb:32100:SS:0": "", // Shuttle Selatan towards JB SENTRAL
  "ktmb:32100:SS:1": "", // Shuttle Selatan towards PALOH
  "ktmb:32100:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:32100:ETS:1": "", // ETS towards JB SENTRAL
  // PARIT BUNTAR  (Ipoh Line, ETS)
  "ktmb:1900:100_9000:0": "", // Ipoh Line towards BUTTERWORTH
  "ktmb:1900:100_9000:1": "", // Ipoh Line towards IPOH
  "ktmb:1900:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:1900:ETS:1": "", // ETS towards JB SENTRAL
  // PASAR SENI  (KJL)
  "rapid-rail-kl:KJ14:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ14:KJ:1": "", // KJL towards Putra Heights
  // PASAR SENI  (KGL)
  "rapid-rail-kl:KG16:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG16:KGL:1": "", // KGL towards Kwasa Damansara
  // PASIR MAS  (SH, ERT)
  "ktmb:85100:SH:0": "", // SH towards TUMPAT
  "ktmb:85100:SH:1": "", // SH towards KUALA LIPIS
  "ktmb:85100:ERT:0": "", // ERT towards TUMPAT
  "ktmb:85100:ERT:1": "", // ERT towards JB SENTRAL
  // PLAZA RAKYAT  (AGL)
  "rapid-rail-kl:AG8:AG:0": "", // AGL towards Sentul Timur
  "rapid-rail-kl:AG8:AG:1": "", // AGL towards Ampang
  // PLAZA RAKYAT  (SPL)
  "rapid-rail-kl:SP8:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP8:PH:1": "", // SPL towards Putra Heights
  // PUDU  (AGL)
  "rapid-rail-kl:AG10:AG:0": "", // AGL towards Sentul Timur
  "rapid-rail-kl:AG10:AG:1": "", // AGL towards Ampang
  // PUDU  (SPL)
  "rapid-rail-kl:SP10:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP10:PH:1": "", // SPL towards Putra Heights
  // PULAU SEBANG/TAMPIN  (Seremban Line, ETS)
  "ktmb:25100:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:25100:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  "ktmb:25100:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:25100:ETS:1": "", // ETS towards JB SENTRAL
  // PUTRA  (Seremban Line, Port Klang Line)
  "ktmb:18800:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:18800:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  "ktmb:18800:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:18800:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // PUTRA HEIGHTS  (KJL)
  "rapid-rail-kl:KJ37:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ37:KJ:1": "", // KJL towards Putra Heights
  // PUTRA HEIGHTS  (SPL)
  "rapid-rail-kl:SP31:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP31:PH:1": "", // SPL towards Putra Heights
  // PWTC  (AGL)
  "rapid-rail-kl:AG4:AG:0": "", // AGL towards Sentul Timur
  "rapid-rail-kl:AG4:AG:1": "", // AGL towards Ampang
  // PWTC  (SPL)
  "rapid-rail-kl:SP4:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP4:PH:1": "", // SPL towards Putra Heights
  // RAWANG  (Port Klang Line, ETS)
  "ktmb:17800:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:17800:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  "ktmb:17800:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:17800:ETS:1": "", // ETS towards JB SENTRAL
  // RENGAM  (Shuttle Selatan, ETS)
  "ktmb:34200:SS:0": "", // Shuttle Selatan towards JB SENTRAL
  "ktmb:34200:SS:1": "", // Shuttle Selatan towards PALOH
  "ktmb:34200:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:34200:ETS:1": "", // ETS towards JB SENTRAL
  // SALAK SELATAN  (SPL)
  "rapid-rail-kl:SP13:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP13:PH:1": "", // SPL towards Putra Heights
  // SALAK SELATAN  (Seremban Line)
  "ktmb:19400:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:19400:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  // SEGAMAT  (ETS, ERT)
  "ktmb:29100:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:29100:ETS:1": "", // ETS towards JB SENTRAL
  "ktmb:29100:ERT:0": "", // ERT towards TUMPAT
  "ktmb:29100:ERT:1": "", // ERT towards JB SENTRAL
  // SENTUL  (AGL)
  "rapid-rail-kl:AG2:AG:0": "", // AGL towards Sentul Timur
  "rapid-rail-kl:AG2:AG:1": "", // AGL towards Ampang
  // SENTUL  (SPL)
  "rapid-rail-kl:SP2:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP2:PH:1": "", // SPL towards Putra Heights
  // SENTUL  (Seremban Line)
  "ktmb:50000:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:50000:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  // SENTUL TIMUR  (AGL)
  "rapid-rail-kl:AG1:AG:0": "", // AGL towards Sentul Timur
  "rapid-rail-kl:AG1:AG:1": "", // AGL towards Ampang
  // SENTUL TIMUR  (SPL)
  "rapid-rail-kl:SP1:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP1:PH:1": "", // SPL towards Putra Heights
  // SEREMBAN  (Seremban Line, ETS)
  "ktmb:22700:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:22700:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  "ktmb:22700:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:22700:ETS:1": "", // ETS towards JB SENTRAL
  // SUBANG JAYA  (KJL)
  "rapid-rail-kl:KJ28:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ28:KJ:1": "", // KJL towards Putra Heights
  // SUBANG JAYA  (Port Klang Line)
  "ktmb:53700:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:53700:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // SULTAN ISMAIL  (AGL)
  "rapid-rail-kl:AG5:AG:0": "", // AGL towards Sentul Timur
  "rapid-rail-kl:AG5:AG:1": "", // AGL towards Ampang
  // SULTAN ISMAIL  (SPL)
  "rapid-rail-kl:SP5:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP5:PH:1": "", // SPL towards Putra Heights
  // SUNGAI BESI  (SPL)
  "rapid-rail-kl:SP16:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP16:PH:1": "", // SPL towards Putra Heights
  // SUNGAI BESI  (PYL)
  "rapid-rail-kl:PY29:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY29:PYL:1": "", // PYL towards Kwasa Damansara
  // SUNGAI BULOH  (PYL)
  "rapid-rail-kl:PY04:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY04:PYL:1": "", // PYL towards Kwasa Damansara
  // SUNGAI BULOH  (Port Klang Line, ETS)
  "ktmb:18500:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:18500:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  "ktmb:18500:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:18500:ETS:1": "", // ETS towards JB SENTRAL
  // SUNGAI PETANI  (Padang Besar Line, ETS)
  "ktmb:41400:100_47300:0": "", // Padang Besar Line towards PADANG BESAR
  "ktmb:41400:100_47300:1": "", // Padang Besar Line towards BUTTERWORTH
  "ktmb:41400:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:41400:ETS:1": "", // ETS towards JB SENTRAL
  // SUNGAI SIPUT  (Ipoh Line, ETS)
  "ktmb:7300:100_9000:0": "", // Ipoh Line towards BUTTERWORTH
  "ktmb:7300:100_9000:1": "", // Ipoh Line towards IPOH
  "ktmb:7300:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:7300:ETS:1": "", // ETS towards JB SENTRAL
  // TAIPING  (Ipoh Line, ETS)
  "ktmb:4700:100_9000:0": "", // Ipoh Line towards BUTTERWORTH
  "ktmb:4700:100_9000:1": "", // Ipoh Line towards IPOH
  "ktmb:4700:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:4700:ETS:1": "", // ETS towards JB SENTRAL
  // TANAH MERAH  (SH, ERT)
  "ktmb:83700:SH:0": "", // SH towards TUMPAT
  "ktmb:83700:SH:1": "", // SH towards KUALA LIPIS
  "ktmb:83700:ERT:0": "", // ERT towards TUMPAT
  "ktmb:83700:ERT:1": "", // ERT towards JB SENTRAL
  // TANJONG MALIM  (Port Klang Line, ETS)
  "ktmb:15200:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:15200:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  "ktmb:15200:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:15200:ETS:1": "", // ETS towards JB SENTRAL
  // TASEK GELUGOR  (Padang Besar Line, ETS)
  "ktmb:40500:100_47300:0": "", // Padang Besar Line towards PADANG BESAR
  "ktmb:40500:100_47300:1": "", // Padang Besar Line towards BUTTERWORTH
  "ktmb:40500:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:40500:ETS:1": "", // ETS towards JB SENTRAL
  // TITIWANGSA  (AGL)
  "rapid-rail-kl:AG3:AG:0": "", // AGL towards Sentul Timur
  "rapid-rail-kl:AG3:AG:1": "", // AGL towards Ampang
  // TITIWANGSA  (SPL)
  "rapid-rail-kl:SP3:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP3:PH:1": "", // SPL towards Putra Heights
  // TITIWANGSA  (PYL)
  "rapid-rail-kl:PY17:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY17:PYL:1": "", // PYL towards Kwasa Damansara
  // TITIWANGSA  (MRL)
  "rapid-rail-kl:MR11:MR:0": "", // MRL towards Titiwangsa
  "rapid-rail-kl:MR11:MR:1": "", // MRL towards KL Sentral
  // TUMPAT  (SH, ERT)
  "ktmb:86300:SH:0": "", // SH towards TUMPAT
  "ktmb:86300:SH:1": "", // SH towards KUALA LIPIS
  "ktmb:86300:ERT:0": "", // ERT towards TUMPAT
  "ktmb:86300:ERT:1": "", // ERT towards JB SENTRAL
  // TUN RAZAK EXCHANGE  (KGL)
  "rapid-rail-kl:KG20:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG20:KGL:1": "", // KGL towards Kwasa Damansara
  // TUN RAZAK EXCHANGE  (PYL)
  "rapid-rail-kl:PY23:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY23:PYL:1": "", // PYL towards Kwasa Damansara
  // WAKAF BHARU  (SH, ERT)
  "ktmb:85700:SH:0": "", // SH towards TUMPAT
  "ktmb:85700:SH:1": "", // SH towards KUALA LIPIS
  "ktmb:85700:ERT:0": "", // ERT towards TUMPAT
  "ktmb:85700:ERT:1": "", // ERT towards JB SENTRAL

  /* ===== single-line stations ===== */
  // 16 SIERRA  (PYL)
  "rapid-rail-kl:PY38:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY38:PYL:1": "", // PYL towards Kwasa Damansara
  // ALAM MEGAH  (KJL)
  "rapid-rail-kl:KJ35:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ35:KJ:1": "", // KJL towards Putra Heights
  // ALAM SUTERA  (SPL)
  "rapid-rail-kl:SP21:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP21:PH:1": "", // SPL towards Putra Heights
  // AMPANG  (AGL)
  "rapid-rail-kl:AG18:AG:0": "", // AGL towards Sentul Timur
  "rapid-rail-kl:AG18:AG:1": "", // AGL towards Ampang
  // ANGKASAPURI  (Port Klang Line)
  "ktmb:52800:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:52800:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // ARA DAMANSARA  (KJL)
  "rapid-rail-kl:KJ26:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ26:KJ:1": "", // KJL towards Putra Heights
  // ASIA JAYA  (KJL)
  "rapid-rail-kl:KJ21:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ21:KJ:1": "", // KJL towards Putra Heights
  // AUR GADING  (SH)
  "ktmb:72700:SH:1": "", // SH towards KUALA LIPIS
  // AWAN BESAR  (SPL)
  "rapid-rail-kl:SP19:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP19:PH:1": "", // SPL towards Putra Heights
  // BAHAU  (ERT)
  "ktmb:61800:ERT:0": "", // ERT towards TUMPAT
  "ktmb:61800:ERT:1": "", // ERT towards JB SENTRAL
  // BANDAR BARU KLANG  (SAL)
  "rapid-rail-kl:SA17:SA:0": "", // SAL towards Johan Setia
  "rapid-rail-kl:SA17:SA:1": "", // SAL towards Bandar Utama
  // BANDAR BUKIT TINGGI  (SAL)
  "rapid-rail-kl:SA24:SA:0": "", // SAL towards Johan Setia
  "rapid-rail-kl:SA24:SA:1": "", // SAL towards Bandar Utama
  // BANDAR PUTERI  (SPL)
  "rapid-rail-kl:SP27:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP27:PH:1": "", // SPL towards Putra Heights
  // BANDAR TASIK SELATAN  (SPL)
  "rapid-rail-kl:SP15:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP15:PH:1": "", // SPL towards Putra Heights
  // BANDAR TUN HUSSEIN ONN  (KGL)
  "rapid-rail-kl:KG29:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG29:KGL:1": "", // KGL towards Kwasa Damansara
  // BANDAR TUN RAZAK  (SPL)
  "rapid-rail-kl:SP14:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP14:PH:1": "", // SPL towards Putra Heights
  // BANDAR UTAMA 11  (SAL)
  "rapid-rail-kl:SA3:SA:0": "", // SAL towards Johan Setia
  "rapid-rail-kl:SA3:SA:1": "", // SAL towards Bandar Utama
  // BANGI  (Seremban Line)
  "ktmb:20900:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:20900:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  // BANGSAR - BANK RAKYAT  (KJL)
  "rapid-rail-kl:KJ16:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ16:KJ:1": "", // KJL towards Putra Heights
  // BATANG BENAR  (Seremban Line)
  "ktmb:21300:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:21300:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  // BATANG KALI  (Port Klang Line)
  "ktmb:16500:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:16500:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // BATANG MELAKA  (ETS)
  "ktmb:26400:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:26400:ETS:1": "", // ETS towards JB SENTRAL
  // BATU 11 CHERAS  (KGL)
  "rapid-rail-kl:KG30:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG30:KGL:1": "", // KGL towards Kwasa Damansara
  // BATU CAVES  (Seremban Line)
  "ktmb:50600:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:50600:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  // BATU GAJAH  (ETS)
  "ktmb:9700:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:9700:ETS:1": "", // ETS towards JB SENTRAL
  // BATU KENTOMENN  (Seremban Line)
  "ktmb:50300:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:50300:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  // BATU TIGA  (Port Klang Line)
  "ktmb:53800:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:53800:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // BEKOK  (ETS)
  "ktmb:31300:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:31300:ETS:1": "", // ETS towards JB SENTRAL
  // BERTAM  (SH)
  "ktmb:77900:SH:0": "", // SH towards TUMPAT
  "ktmb:77900:SH:1": "", // SH towards KUALA LIPIS
  // BERTAM BARU  (SH)
  "ktmb:77800:SH:0": "", // SH towards TUMPAT
  "ktmb:77800:SH:1": "", // SH towards KUALA LIPIS
  // BUKIT BADAK  (Port Klang Line)
  "ktmb:54500:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:54500:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // BUKIT BETONG  (SH)
  "ktmb:72200:SH:1": "", // SH towards KUALA LIPIS
  // BUKIT DUKUNG  (KGL)
  "rapid-rail-kl:KG31:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG31:KGL:1": "", // KGL towards Kwasa Damansara
  // BUKIT JALIL  (SPL)
  "rapid-rail-kl:SP17:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP17:PH:1": "", // SPL towards Putra Heights
  // BUKIT KETRI  (Padang Besar Line)
  "ktmb:46300:100_47300:0": "", // Padang Besar Line towards PADANG BESAR
  "ktmb:46300:100_47300:1": "", // Padang Besar Line towards BUTTERWORTH
  // BUKIT NANAS  (MRL)
  "rapid-rail-kl:MR8:MR:0": "", // MRL towards Titiwangsa
  "rapid-rail-kl:MR8:MR:1": "", // MRL towards KL Sentral
  // BUKIT PANAU  (SH)
  "ktmb:84200:SH:0": "", // SH towards TUMPAT
  "ktmb:84200:SH:1": "", // SH towards KUALA LIPIS
  // BUNUT SUSU  (SH)
  "ktmb:85500:SH:0": "", // SH towards TUMPAT
  "ktmb:85500:SH:1": "", // SH towards KUALA LIPIS
  // CAHAYA  (AGL)
  "rapid-rail-kl:AG17:AG:0": "", // AGL towards Sentul Timur
  "rapid-rail-kl:AG17:AG:1": "", // AGL towards Ampang
  // CEMPAKA  (AGL)
  "rapid-rail-kl:AG16:AG:0": "", // AGL towards Sentul Timur
  "rapid-rail-kl:AG16:AG:1": "", // AGL towards Ampang
  // CHERAS  (SPL)
  "rapid-rail-kl:SP12:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP12:PH:1": "", // SPL towards Putra Heights
  // CHICHA TINGGI  (SH)
  "ktmb:84800:SH:0": "", // SH towards TUMPAT
  // CHOW KIT  (MRL)
  "rapid-rail-kl:MR10:MR:0": "", // MRL towards Titiwangsa
  "rapid-rail-kl:MR10:MR:1": "", // MRL towards KL Sentral
  // COCHRANE  (KGL)
  "rapid-rail-kl:KG21:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG21:KGL:1": "", // KGL towards Kwasa Damansara
  // CONLAY  (PYL)
  "rapid-rail-kl:PY22:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY22:PYL:1": "", // PYL towards Kwasa Damansara
  // CYBERJAYA CITY CENTRE  (PYL)
  "rapid-rail-kl:PY40:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY40:PYL:1": "", // PYL towards Kwasa Damansara
  // CYBERJAYA UTARA  (PYL)
  "rapid-rail-kl:PY39:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY39:PYL:1": "", // PYL towards Kwasa Damansara
  // DAMAI  (KJL)
  "rapid-rail-kl:KJ8:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ8:KJ:1": "", // KJL towards Putra Heights
  // DAMANSARA DAMAI  (PYL)
  "rapid-rail-kl:PY05:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY05:PYL:1": "", // PYL towards Kwasa Damansara
  // DAMANSARA IDAMAN  (SAL)
  "rapid-rail-kl:SA5:SA:0": "", // SAL towards Johan Setia
  "rapid-rail-kl:SA5:SA:1": "", // SAL towards Bandar Utama
  // DANG WANGI  (KJL)
  "rapid-rail-kl:KJ12:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ12:KJ:1": "", // KJL towards Putra Heights
  // DATO' KERAMAT  (KJL)
  "rapid-rail-kl:KJ7:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ7:KJ:1": "", // KJL towards Putra Heights
  // DATO' MENTERI - SA SENTRAL  (SAL)
  "rapid-rail-kl:SA12:SA:0": "", // SAL towards Johan Setia
  "rapid-rail-kl:SA12:SA:1": "", // SAL towards Bandar Utama
  // GLENMARIE  (KJL)
  "rapid-rail-kl:KJ27:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ27:KJ:1": "", // KJL towards Putra Heights
  // GLENMARIE 2  (SAL)
  "rapid-rail-kl:SA7:SA:0": "", // SAL towards Johan Setia
  "rapid-rail-kl:SA7:SA:1": "", // SAL towards Bandar Utama
  // GOMBAK  (KJL)
  "rapid-rail-kl:KJ1:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ1:KJ:1": "", // KJL towards Putra Heights
  // HOSPITAL KUALA LUMPUR  (PYL)
  "rapid-rail-kl:PY18:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY18:PYL:1": "", // PYL towards Kwasa Damansara
  // IMBI  (MRL)
  "rapid-rail-kl:MR5:MR:0": "", // MRL towards Titiwangsa
  "rapid-rail-kl:MR5:MR:1": "", // MRL towards KL Sentral
  // IOI PUCHONG JAYA  (SPL)
  "rapid-rail-kl:SP24:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP24:PH:1": "", // SPL towards Putra Heights
  // JALAN IPOH  (PYL)
  "rapid-rail-kl:PY15:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY15:PYL:1": "", // PYL towards Kwasa Damansara
  // JALAN MERU  (SAL)
  "rapid-rail-kl:SA19:SA:0": "", // SAL towards Johan Setia
  "rapid-rail-kl:SA19:SA:1": "", // SAL towards Bandar Utama
  // JALAN TEMPLER  (Port Klang Line)
  "ktmb:53100:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:53100:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // JAMBATAN KOTA  (SAL)
  "rapid-rail-kl:SA20:SA:0": "", // SAL towards Johan Setia
  "rapid-rail-kl:SA20:SA:1": "", // SAL towards Bandar Utama
  // JELATEK  (KJL)
  "rapid-rail-kl:KJ6:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ6:KJ:1": "", // KJL towards Putra Heights
  // JERANTUT  (ERT)
  "ktmb:68700:ERT:0": "", // ERT towards TUMPAT
  "ktmb:68700:ERT:1": "", // ERT towards JB SENTRAL
  // JEREK BARU  (SH)
  "ktmb:78100:SH:0": "", // SH towards TUMPAT
  "ktmb:78100:SH:1": "", // SH towards KUALA LIPIS
  // JINJANG  (PYL)
  "rapid-rail-kl:PY11:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY11:PYL:1": "", // PYL towards Kwasa Damansara
  // JLN KASTAM  (Port Klang Line)
  "ktmb:55100:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:55100:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // JOHAN SETIA  (SAL)
  "rapid-rail-kl:SA26:SA:0": "", // SAL towards Johan Setia
  "rapid-rail-kl:SA26:SA:1": "", // SAL towards Bandar Utama
  // KAJANG 2  (Seremban Line)
  "ktmb:20402:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:20402:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  // KAMPAR  (ETS)
  "ktmb:10900:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:10900:ETS:1": "", // ETS towards JB SENTRAL
  // KAMPUNG BARU - CBP COOPBANK PERTAMA  (KJL)
  "rapid-rail-kl:KJ11:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ11:KJ:1": "", // KJL towards Putra Heights
  // KAMPUNG SELAMAT  (PYL)
  "rapid-rail-kl:PY03:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY03:PYL:1": "", // PYL towards Kwasa Damansara
  // KAMUNTING  (Ipoh Line)
  "ktmb:4500:100_9000:0": "", // Ipoh Line towards BUTTERWORTH
  "ktmb:4500:100_9000:1": "", // Ipoh Line towards IPOH
  // KAYU ARA  (SAL)
  "rapid-rail-kl:SA2:SA:0": "", // SAL towards Johan Setia
  "rapid-rail-kl:SA2:SA:1": "", // SAL towards Bandar Utama
  // KELANA JAYA  (KJL)
  "rapid-rail-kl:KJ24:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ24:KJ:1": "", // KJL towards Putra Heights
  // KEMAYAN  (ERT)
  "ktmb:63700:ERT:0": "", // ERT towards TUMPAT
  "ktmb:63700:ERT:1": "", // ERT towards JB SENTRAL
  // KEMUBU  (SH)
  "ktmb:78900:SH:0": "", // SH towards TUMPAT
  "ktmb:78900:SH:1": "", // SH towards KUALA LIPIS
  // KENTOMEN  (PYL)
  "rapid-rail-kl:PY14:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY14:PYL:1": "", // PYL towards Kwasa Damansara
  // KEPONG  (Port Klang Line)
  "ktmb:18600:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:18600:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // KEPONG BARU  (PYL)
  "rapid-rail-kl:PY10:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY10:PYL:1": "", // PYL towards Kwasa Damansara
  // KEPONG SENTRAL  (Port Klang Line)
  "ktmb:18400:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:18400:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // KERINCHI  (KJL)
  "rapid-rail-kl:KJ18:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ18:KJ:1": "", // KJL towards Putra Heights
  // KERJAYA  (SAL)
  "rapid-rail-kl:SA9:SA:0": "", // SAL towards Johan Setia
  "rapid-rail-kl:SA9:SA:1": "", // SAL towards Bandar Utama
  // KG BARU BUKIT ABU  (SH)
  "ktmb:80300:SH:0": "", // SH towards TUMPAT
  "ktmb:80300:SH:1": "", // SH towards KUALA LIPIS
  // KG BERKAM  (SH)
  "ktmb:72400:SH:1": "", // SH towards KUALA LIPIS
  // KG DATO HARUN  (Port Klang Line)
  "ktmb:53400:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:53400:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // KG KOK PASIR  (SH)
  "ktmb:86000:SH:0": "", // SH towards TUMPAT
  // KG RAJA UDA  (Port Klang Line)
  "ktmb:55000:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:55000:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // KG. SIRIAN  (SH)
  "ktmb:77000:SH:0": "", // SH towards TUMPAT
  "ktmb:77000:SH:1": "", // SH towards KUALA LIPIS
  // KINRARA  (SPL)
  "rapid-rail-kl:SP22:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP22:PH:1": "", // SPL towards Putra Heights
  // KL SENTRAL - REDONE  (KJL)
  "rapid-rail-kl:KJ15:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ15:KJ:1": "", // KJL towards Putra Heights
  // KLANG  (Port Klang Line)
  "ktmb:54700:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:54700:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // KLANG JAYA  (SAL)
  "rapid-rail-kl:SA23:SA:0": "", // SAL towards Johan Setia
  "rapid-rail-kl:SA23:SA:1": "", // SAL towards Bandar Utama
  // KLCC  (KJL)
  "rapid-rail-kl:KJ10:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ10:KJ:1": "", // KJL towards Putra Heights
  // KOBAH  (Padang Besar Line)
  "ktmb:43100:100_47300:0": "", // Padang Besar Line towards PADANG BESAR
  "ktmb:43100:100_47300:1": "", // Padang Besar Line towards BUTTERWORTH
  // KODIANG  (Padang Besar Line)
  "ktmb:45600:100_47300:0": "", // Padang Besar Line towards PADANG BESAR
  "ktmb:45600:100_47300:1": "", // Padang Besar Line towards BUTTERWORTH
  // KOTA DAMANSARA  (KGL)
  "rapid-rail-kl:KG06:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG06:KGL:1": "", // KGL towards Kwasa Damansara
  // KRAMBIT  (ERT)
  "ktmb:70200:ERT:0": "", // ERT towards TUMPAT
  "ktmb:70200:ERT:1": "", // ERT towards JB SENTRAL
  // KUALA GRIS  (SH)
  "ktmb:79800:SH:0": "", // SH towards TUMPAT
  "ktmb:79800:SH:1": "", // SH towards KUALA LIPIS
  // KUALA KRAU  (ERT)
  "ktmb:67400:ERT:0": "", // ERT towards TUMPAT
  "ktmb:67400:ERT:1": "", // ERT towards JB SENTRAL
  // KUALA KUBU BHARU  (Port Klang Line)
  "ktmb:16100:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  // KUANG  (Port Klang Line)
  "ktmb:18100:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:18100:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // KUCHAI  (PYL)
  "rapid-rail-kl:PY27:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY27:PYL:1": "", // PYL towards Kwasa Damansara
  // KWASA SENTRAL  (KGL)
  "rapid-rail-kl:KG05:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG05:KGL:1": "", // KGL towards Kwasa Damansara
  // LABIS  (ETS)
  "ktmb:30500:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:30500:ETS:1": "", // ETS towards JB SENTRAL
  // LABU  (Seremban Line)
  "ktmb:22000:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:22000:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  // LEMBAH SUBANG  (KJL)
  "rapid-rail-kl:KJ25:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ25:KJ:1": "", // KJL towards Putra Heights
  // LIMAU KASTURI  (SH)
  "ktmb:77400:SH:0": "", // SH towards TUMPAT
  "ktmb:77400:SH:1": "", // SH towards KUALA LIPIS
  // MAHARAJALELA  (MRL)
  "rapid-rail-kl:MR3:MR:0": "", // MRL towards Titiwangsa
  "rapid-rail-kl:MR3:MR:1": "", // MRL towards KL Sentral
  // MANEK URAI  (SH)
  "ktmb:81200:SH:0": "", // SH towards TUMPAT
  "ktmb:81200:SH:1": "", // SH towards KUALA LIPIS
  // MEDAN TUANKU  (MRL)
  "rapid-rail-kl:MR9:MR:0": "", // MRL towards Titiwangsa
  "rapid-rail-kl:MR9:MR:1": "", // MRL towards KL Sentral
  // MENGKIBOL  (Shuttle Selatan)
  "ktmb:33600:SS:1": "", // Shuttle Selatan towards PALOH
  // MENTAKAB  (ERT)
  "ktmb:66100:ERT:0": "", // ERT towards TUMPAT
  "ktmb:66100:ERT:1": "", // ERT towards JB SENTRAL
  // MENTARA BARU  (SH)
  "ktmb:75000:SH:1": "", // SH towards KUALA LIPIS
  // MENTARI  (BRT)
  "rapid-rail-kl:BRT2:BRT:0": "", // BRT towards USJ 7
  "rapid-rail-kl:BRT2:BRT:1": "", // BRT towards Sunway-Setia Jaya
  // MERDEKA  (KGL)
  "rapid-rail-kl:KG17:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG17:KGL:1": "", // KGL towards Kwasa Damansara
  // METRO PRIMA  (PYL)
  "rapid-rail-kl:PY09:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY09:PYL:1": "", // PYL towards Kwasa Damansara
  // MIHARJA  (AGL)
  "rapid-rail-kl:AG12:AG:0": "", // AGL towards Sentul Timur
  "rapid-rail-kl:AG12:AG:1": "", // AGL towards Ampang
  // MUHIBBAH  (SPL)
  "rapid-rail-kl:SP20:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP20:PH:1": "", // SPL towards Putra Heights
  // MUTIARA DAMANSARA  (KGL)
  "rapid-rail-kl:KG08:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG08:KGL:1": "", // KGL towards Kwasa Damansara
  // MUZIUM NEGARA  (KGL)
  "rapid-rail-kl:KG15:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG15:KGL:1": "", // KGL towards Kwasa Damansara
  // NILAI  (Seremban Line)
  "ktmb:21500:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:21500:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  // PADANG JAWA  (Port Klang Line)
  "ktmb:54400:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:54400:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // PADANG RENGAS  (Ipoh Line)
  "ktmb:5700:100_9000:0": "", // Ipoh Line towards BUTTERWORTH
  "ktmb:5700:100_9000:1": "", // Ipoh Line towards IPOH
  // PADANG TUNGKU  (SH)
  "ktmb:71800:SH:1": "", // SH towards KUALA LIPIS
  // PAHI  (SH)
  "ktmb:81700:SH:0": "", // SH towards TUMPAT
  "ktmb:81700:SH:1": "", // SH towards KUALA LIPIS
  // PAN MALAYAN  (SH)
  "ktmb:76600:SH:0": "", // SH towards TUMPAT
  "ktmb:76600:SH:1": "", // SH towards KUALA LIPIS
  // PANDAN INDAH  (AGL)
  "rapid-rail-kl:AG15:AG:0": "", // AGL towards Sentul Timur
  "rapid-rail-kl:AG15:AG:1": "", // AGL towards Ampang
  // PANDAN JAYA  (AGL)
  "rapid-rail-kl:AG14:AG:0": "", // AGL towards Sentul Timur
  "rapid-rail-kl:AG14:AG:1": "", // AGL towards Ampang
  // PANTAI DALAM  (Port Klang Line)
  "ktmb:52900:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:52900:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // PASAR KLANG  (SAL)
  "rapid-rail-kl:SA18:SA:0": "", // SAL towards Johan Setia
  "rapid-rail-kl:SA18:SA:1": "", // SAL towards Bandar Utama
  // PEL KLANG SEL  (Port Klang Line)
  "ktmb:55200:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:55200:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // PERHENTIAN MIDVALLEY  (Seremban Line)
  "ktmb:19205:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:19205:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  // PERSIARAN KLCC  (PYL)
  "rapid-rail-kl:PY21:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY21:PYL:1": "", // PYL towards Kwasa Damansara
  // PETALING  (Port Klang Line)
  "ktmb:53000:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:53000:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // PHILEO DAMANSARA  (KGL)
  "rapid-rail-kl:KG12:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG12:KGL:1": "", // KGL towards Kwasa Damansara
  // PUCHONG PERDANA  (SPL)
  "rapid-rail-kl:SP28:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP28:PH:1": "", // SPL towards Putra Heights
  // PUCHONG PRIMA  (SPL)
  "rapid-rail-kl:SP29:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP29:PH:1": "", // SPL towards Putra Heights
  // PUSAT BANDAR DAMANSARA  (KGL)
  "rapid-rail-kl:KG13:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG13:KGL:1": "", // KGL towards Kwasa Damansara
  // PUSAT BANDAR PUCHONG  (SPL)
  "rapid-rail-kl:SP25:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP25:PH:1": "", // SPL towards Putra Heights
  // PUTRA PERMAI  (PYL)
  "rapid-rail-kl:PY37:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY37:PYL:1": "", // PYL towards Kwasa Damansara
  // PUTRAJAYA SENTRAL  (PYL)
  "rapid-rail-kl:PY41:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY41:PYL:1": "", // PYL towards Kwasa Damansara
  // RAJA CHULAN  (MRL)
  "rapid-rail-kl:MR7:MR:0": "", // MRL towards Titiwangsa
  "rapid-rail-kl:MR7:MR:1": "", // MRL towards KL Sentral
  // RAJA UDA  (PYL)
  "rapid-rail-kl:PY19:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY19:PYL:1": "", // PYL towards Kwasa Damansara
  // RASA  (Port Klang Line)
  "ktmb:16300:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  // REMBAU  (Seremban Line)
  "ktmb:23900:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:23900:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  // SEGAMBUT  (Port Klang Line)
  "ktmb:18700:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:18700:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // SEKSYEN 7  (SAL)
  "rapid-rail-kl:SA15:SA:0": "", // SAL towards Johan Setia
  "rapid-rail-kl:SA15:SA:1": "", // SAL towards Bandar Utama
  // SEMANTAN  (KGL)
  "rapid-rail-kl:KG14:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG14:KGL:1": "", // KGL towards Kwasa Damansara
  // SENAWANG  (Seremban Line)
  "ktmb:22900:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:22900:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  // SENTUL BARAT  (PYL)
  "rapid-rail-kl:PY16:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY16:PYL:1": "", // PYL towards Kwasa Damansara
  // SEPUTEH  (Seremban Line)
  "ktmb:19300:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:19300:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  // SERDANG  (Seremban Line)
  "ktmb:19900:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:19900:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  // SERDANG JAYA  (PYL)
  "rapid-rail-kl:PY33:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY33:PYL:1": "", // PYL towards Kwasa Damansara
  // SERDANG RAYA SELATAN  (PYL)
  "rapid-rail-kl:PY32:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY32:PYL:1": "", // PYL towards Kwasa Damansara
  // SERDANG RAYA UTARA  (PYL)
  "rapid-rail-kl:PY31:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY31:PYL:1": "", // PYL towards Kwasa Damansara
  // SERENDAH  (Port Klang Line)
  "ktmb:17300:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:17300:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // SERI ANDALAS  (SAL)
  "rapid-rail-kl:SA22:SA:0": "", // SAL towards Johan Setia
  "rapid-rail-kl:SA22:SA:1": "", // SAL towards Bandar Utama
  // SERI SETIA  (Port Klang Line)
  "ktmb:53500:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:53500:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // SETIA JAYA  (Port Klang Line)
  "ktmb:53600:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:53600:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // SETIAWANGSA  (KJL)
  "rapid-rail-kl:KJ5:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ5:KJ:1": "", // KJL towards Putra Heights
  // SG MENGKUANG BARU  (SH)
  "ktmb:80700:SH:0": "", // SH towards TUMPAT
  "ktmb:80700:SH:1": "", // SH towards KUALA LIPIS
  // SHAH ALAM  (Port Klang Line)
  "ktmb:54200:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:54200:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // SIMPANG AMPAT  (Ipoh Line)
  "ktmb:1000:100_9000:0": "", // Ipoh Line towards BUTTERWORTH
  "ktmb:1000:100_9000:1": "", // Ipoh Line towards IPOH
  // SOUTH QUAY-USJ 1  (BRT)
  "rapid-rail-kl:BRT6:BRT:0": "", // BRT towards USJ 7
  "rapid-rail-kl:BRT6:BRT:1": "", // BRT towards Sunway-Setia Jaya
  // SRI BINTANG  (SH)
  "ktmb:78400:SH:0": "", // SH towards TUMPAT
  "ktmb:78400:SH:1": "", // SH towards KUALA LIPIS
  // SRI DAMANSARA BARAT  (PYL)
  "rapid-rail-kl:PY06:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY06:PYL:1": "", // PYL towards Kwasa Damansara
  // SRI DAMANSARA SENTRAL  (PYL)
  "rapid-rail-kl:PY07:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY07:PYL:1": "", // PYL towards Kwasa Damansara
  // SRI DAMANSARA TIMUR  (PYL)
  "rapid-rail-kl:PY08:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY08:PYL:1": "", // PYL towards Kwasa Damansara
  // SRI DELIMA  (PYL)
  "rapid-rail-kl:PY12:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY12:PYL:1": "", // PYL towards Kwasa Damansara
  // SRI JAYA  (SH)
  "ktmb:78700:SH:0": "", // SH towards TUMPAT
  "ktmb:78700:SH:1": "", // SH towards KUALA LIPIS
  // SRI MAHLIGAI  (SH)
  "ktmb:78500:SH:0": "", // SH towards TUMPAT
  "ktmb:78500:SH:1": "", // SH towards KUALA LIPIS
  // SRI PETALING  (SPL)
  "rapid-rail-kl:SP18:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP18:PH:1": "", // SPL towards Putra Heights
  // SRI RAMPAI  (KJL)
  "rapid-rail-kl:KJ4:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ4:KJ:1": "", // KJL towards Putra Heights
  // SRI RAYA  (KGL)
  "rapid-rail-kl:KG28:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG28:KGL:1": "", // KGL towards Kwasa Damansara
  // SS 15  (KJL)
  "rapid-rail-kl:KJ29:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ29:KJ:1": "", // KJL towards Putra Heights
  // SS 18  (KJL)
  "rapid-rail-kl:KJ30:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ30:KJ:1": "", // KJL towards Putra Heights
  // STADIUM KAJANG  (KGL)
  "rapid-rail-kl:KG34:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG34:KGL:1": "", // KGL towards Kwasa Damansara
  // STADIUM SHAH ALAM  (SAL)
  "rapid-rail-kl:SA10:SA:0": "", // SAL towards Johan Setia
  "rapid-rail-kl:SA10:SA:1": "", // SAL towards Bandar Utama
  // SUBANG  (SAL)
  "rapid-rail-kl:SA6:SA:0": "", // SAL towards Johan Setia
  "rapid-rail-kl:SA6:SA:1": "", // SAL towards Bandar Utama
  // SUBANG ALAM  (KJL)
  "rapid-rail-kl:KJ36:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ36:KJ:1": "", // KJL towards Putra Heights
  // SUNGAI GADUT  (Seremban Line)
  "ktmb:23100:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:23100:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  // SUNGAI JERNIH  (KGL)
  "rapid-rail-kl:KG33:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG33:KGL:1": "", // KGL towards Kwasa Damansara
  // SUNGAI KELADI  (SH)
  "ktmb:84400:SH:0": "", // SH towards TUMPAT
  // SUNGAI NAL  (SH)
  "ktmb:82400:SH:0": "", // SH towards TUMPAT
  // SUNGAI SIRIAN  (SH)
  "ktmb:77200:SH:0": "", // SH towards TUMPAT
  "ktmb:77200:SH:1": "", // SH towards KUALA LIPIS
  // SUNGAI TASIN  (SH)
  "ktmb:78300:SH:0": "", // SH towards TUMPAT
  "ktmb:78300:SH:1": "", // SH towards KUALA LIPIS
  // SUNGAI TEMAU  (SH)
  "ktmb:73500:SH:1": "", // SH towards KUALA LIPIS
  // SUNMED  (BRT)
  "rapid-rail-kl:BRT4:BRT:0": "", // BRT towards USJ 7
  "rapid-rail-kl:BRT4:BRT:1": "", // BRT towards Sunway-Setia Jaya
  // SunU-Monash  (BRT)
  "rapid-rail-kl:BRT5:BRT:0": "", // BRT towards USJ 7
  "rapid-rail-kl:BRT5:BRT:1": "", // BRT towards Sunway-Setia Jaya
  // SUNWAY LAGOON  (BRT)
  "rapid-rail-kl:BRT3:BRT:0": "", // BRT towards USJ 7
  "rapid-rail-kl:BRT3:BRT:1": "", // BRT towards Sunway-Setia Jaya
  // SUNWAY-SETIA JAYA  (BRT)
  "rapid-rail-kl:BRT1:BRT:0": "", // BRT towards USJ 7
  "rapid-rail-kl:BRT1:BRT:1": "", // BRT towards Sunway-Setia Jaya
  // SURIAN  (KGL)
  "rapid-rail-kl:KG07:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG07:KGL:1": "", // KGL towards Kwasa Damansara
  // TAIPAN  (KJL)
  "rapid-rail-kl:KJ32:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ32:KJ:1": "", // KJL towards Putra Heights
  // TAMAN BAHAGIA  (KJL)
  "rapid-rail-kl:KJ23:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ23:KJ:1": "", // KJL towards Putra Heights
  // TAMAN CONNAUGHT  (KGL)
  "rapid-rail-kl:KG26:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG26:KGL:1": "", // KGL towards Kwasa Damansara
  // TAMAN EQUINE  (PYL)
  "rapid-rail-kl:PY36:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY36:PYL:1": "", // PYL towards Kwasa Damansara
  // TAMAN JAYA  (KJL)
  "rapid-rail-kl:KJ20:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ20:KJ:1": "", // KJL towards Putra Heights
  // TAMAN MELATI  (KJL)
  "rapid-rail-kl:KJ2:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ2:KJ:1": "", // KJL towards Putra Heights
  // TAMAN MIDAH  (KGL)
  "rapid-rail-kl:KG24:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG24:KGL:1": "", // KGL towards Kwasa Damansara
  // TAMAN MUTIARA  (KGL)
  "rapid-rail-kl:KG25:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG25:KGL:1": "", // KGL towards Kwasa Damansara
  // TAMAN NAGA EMAS  (PYL)
  "rapid-rail-kl:PY28:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY28:PYL:1": "", // PYL towards Kwasa Damansara
  // TAMAN PARAMOUNT  (KJL)
  "rapid-rail-kl:KJ22:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ22:KJ:1": "", // KJL towards Putra Heights
  // TAMAN PERINDUSTRIAN PUCHONG  (SPL)
  "rapid-rail-kl:SP26:PH:0": "", // SPL towards Sentul Timur
  "rapid-rail-kl:SP26:PH:1": "", // SPL towards Putra Heights
  // TAMAN PERTAMA  (KGL)
  "rapid-rail-kl:KG23:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG23:KGL:1": "", // KGL towards Kwasa Damansara
  // TAMAN SELATAN  (SAL)
  "rapid-rail-kl:SA21:SA:0": "", // SAL towards Johan Setia
  "rapid-rail-kl:SA21:SA:1": "", // SAL towards Bandar Utama
  // TAMAN SUNTEX  (KGL)
  "rapid-rail-kl:KG27:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG27:KGL:1": "", // KGL towards Kwasa Damansara
  // TAMAN TUN DR ISMAIL  (KGL)
  "rapid-rail-kl:KG10:KGL:0": "", // KGL towards Kajang
  "rapid-rail-kl:KG10:KGL:1": "", // KGL towards Kwasa Damansara
  // TAMAN WAHYU  (Seremban Line)
  "ktmb:50500:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:50500:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  // TAPAH ROAD  (ETS)
  "ktmb:11600:ETS:0": "", // ETS towards PADANG BESAR
  "ktmb:11600:ETS:1": "", // ETS towards JB SENTRAL
  // TELOK GADONG  (Port Klang Line)
  "ktmb:54900:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:54900:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // TELOK PULAI  (Port Klang Line)
  "ktmb:54800:KA15_KD19:0": "", // Port Klang Line towards TANJONG MALIM
  "ktmb:54800:KA15_KD19:1": "", // Port Klang Line towards PEL KLANG SEL
  // TELUK GUNUNG  (SH)
  "ktmb:74500:SH:1": "", // SH towards KUALA LIPIS
  // TEMANGAN  (SH)
  "ktmb:83100:SH:0": "", // SH towards TUMPAT
  "ktmb:83100:SH:1": "", // SH towards KUALA LIPIS
  // TIROI  (Seremban Line)
  "ktmb:22400:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:22400:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  // TO UBAN  (SH)
  "ktmb:84600:SH:0": "", // SH towards TUMPAT
  "ktmb:84600:SH:1": "", // SH towards KUALA LIPIS
  // TRIANG  (ERT)
  "ktmb:64400:ERT:0": "", // ERT towards TUMPAT
  "ktmb:64400:ERT:1": "", // ERT towards JB SENTRAL
  // TUN SAMBANTHAN  (MRL)
  "rapid-rail-kl:MR2:MR:0": "", // MRL towards Titiwangsa
  "rapid-rail-kl:MR2:MR:1": "", // MRL towards KL Sentral
  // UITM SHAH ALAM  (SAL)
  "rapid-rail-kl:SA14:SA:0": "", // SAL towards Johan Setia
  "rapid-rail-kl:SA14:SA:1": "", // SAL towards Bandar Utama
  // UKM  (Seremban Line)
  "ktmb:20500:KC05_KB18:0": "", // Seremban Line towards BATU CAVES
  "ktmb:20500:KC05_KB18:1": "", // Seremban Line towards PULAU SEBANG/TAMPIN
  // ULU TEMIANG  (SH)
  "ktmb:80500:SH:0": "", // SH towards TUMPAT
  "ktmb:80500:SH:1": "", // SH towards KUALA LIPIS
  // UNIVERSITI  (KJL)
  "rapid-rail-kl:KJ19:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ19:KJ:1": "", // KJL towards Putra Heights
  // UPM  (PYL)
  "rapid-rail-kl:PY34:PYL:0": "", // PYL towards Putrajaya
  "rapid-rail-kl:PY34:PYL:1": "", // PYL towards Kwasa Damansara
  // USJ 21  (KJL)
  "rapid-rail-kl:KJ34:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ34:KJ:1": "", // KJL towards Putra Heights
  // USJ 7  (KJL)
  "rapid-rail-kl:KJ31:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ31:KJ:1": "", // KJL towards Putra Heights
  // USJ7  (BRT)
  "rapid-rail-kl:BRT7:BRT:0": "", // BRT towards USJ 7
  "rapid-rail-kl:BRT7:BRT:1": "", // BRT towards Sunway-Setia Jaya
  // WANGSA MAJU  (KJL)
  "rapid-rail-kl:KJ3:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ3:KJ:1": "", // KJL towards Putra Heights
  // WAWASAN  (KJL)
  "rapid-rail-kl:KJ33:KJ:0": "", // KJL towards Gombak
  "rapid-rail-kl:KJ33:KJ:1": "", // KJL towards Putra Heights
  // WOODLANDS CIQ  (ST)
  "ktmb:37600:ST:0": "", // ST towards JB SENTRAL
  "ktmb:37600:ST:1": "", // ST towards WOODLANDS CIQ
};
