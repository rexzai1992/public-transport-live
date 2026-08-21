/* Singapore rail network — line sequences curated (2026: CCL loop closed,
   NE18, DT4 Hume, TE21 Marina South included); coordinates are official,
   distilled from LTA's MRT Station Exit dataset (data.gov.sg, 2026-07),
   averaging each station's exits. Regenerate via the exits dataset if a
   new line opens. */

export type SgRailLine = {
  name: string;
  color: string;
  /** [peak, off-peak] minutes between trains. */
  headway: [number, number];
  kind?: string;
  stations: { code: string; name: string; lat: number; lon: number }[];
};

export const SG_RAIL_LINES: Record<string, SgRailLine> = {
  "NSL": {
    "name": "MRT North South Line",
    "color": "d42e12",
    "headway": [
      3,
      5
    ],
    "stations": [
      {
        "code": "NS1",
        "name": "Jurong East",
        "lat": 1.333211,
        "lon": 103.742365
      },
      {
        "code": "NS2",
        "name": "Bukit Batok",
        "lat": 1.349219,
        "lon": 103.749699
      },
      {
        "code": "NS3",
        "name": "Bukit Gombak",
        "lat": 1.359032,
        "lon": 103.751962
      },
      {
        "code": "NS4",
        "name": "Choa Chu Kang",
        "lat": 1.385425,
        "lon": 103.744416
      },
      {
        "code": "NS5",
        "name": "Yew Tee",
        "lat": 1.397499,
        "lon": 103.747267
      },
      {
        "code": "NS7",
        "name": "Kranji",
        "lat": 1.424961,
        "lon": 103.762053
      },
      {
        "code": "NS8",
        "name": "Marsiling",
        "lat": 1.432693,
        "lon": 103.77411
      },
      {
        "code": "NS9",
        "name": "Woodlands",
        "lat": 1.436187,
        "lon": 103.787627
      },
      {
        "code": "NS10",
        "name": "Admiralty",
        "lat": 1.440407,
        "lon": 103.800857
      },
      {
        "code": "NS11",
        "name": "Sembawang",
        "lat": 1.448922,
        "lon": 103.820015
      },
      {
        "code": "NS12",
        "name": "Canberra",
        "lat": 1.443227,
        "lon": 103.829712
      },
      {
        "code": "NS13",
        "name": "Yishun",
        "lat": 1.429384,
        "lon": 103.835049
      },
      {
        "code": "NS14",
        "name": "Khatib",
        "lat": 1.417404,
        "lon": 103.832937
      },
      {
        "code": "NS15",
        "name": "Yio Chu Kang",
        "lat": 1.381715,
        "lon": 103.844809
      },
      {
        "code": "NS16",
        "name": "Ang Mo Kio",
        "lat": 1.369618,
        "lon": 103.849676
      },
      {
        "code": "NS17",
        "name": "Bishan",
        "lat": 1.350863,
        "lon": 103.848692
      },
      {
        "code": "NS18",
        "name": "Braddell",
        "lat": 1.340828,
        "lon": 103.846759
      },
      {
        "code": "NS19",
        "name": "Toa Payoh",
        "lat": 1.332741,
        "lon": 103.847285
      },
      {
        "code": "NS20",
        "name": "Novena",
        "lat": 1.320495,
        "lon": 103.843865
      },
      {
        "code": "NS21",
        "name": "Newton",
        "lat": 1.312764,
        "lon": 103.838114
      },
      {
        "code": "NS22",
        "name": "Orchard",
        "lat": 1.303789,
        "lon": 103.83186
      },
      {
        "code": "NS23",
        "name": "Somerset",
        "lat": 1.300368,
        "lon": 103.83884
      },
      {
        "code": "NS24",
        "name": "Dhoby Ghaut",
        "lat": 1.299411,
        "lon": 103.845502
      },
      {
        "code": "NS25",
        "name": "City Hall",
        "lat": 1.293206,
        "lon": 103.852441
      },
      {
        "code": "NS26",
        "name": "Raffles Place",
        "lat": 1.283704,
        "lon": 103.851415
      },
      {
        "code": "NS27",
        "name": "Marina Bay",
        "lat": 1.275451,
        "lon": 103.855131
      },
      {
        "code": "NS28",
        "name": "Marina South Pier",
        "lat": 1.270984,
        "lon": 103.862955
      }
    ]
  },
  "EWL": {
    "name": "MRT East West Line",
    "color": "009645",
    "headway": [
      3,
      5
    ],
    "stations": [
      {
        "code": "EW1",
        "name": "Pasir Ris",
        "lat": 1.372864,
        "lon": 103.949235
      },
      {
        "code": "EW2",
        "name": "Tampines",
        "lat": 1.354317,
        "lon": 103.943782
      },
      {
        "code": "EW3",
        "name": "Simei",
        "lat": 1.342662,
        "lon": 103.953819
      },
      {
        "code": "EW4",
        "name": "Tanah Merah",
        "lat": 1.32696,
        "lon": 103.945759
      },
      {
        "code": "EW5",
        "name": "Bedok",
        "lat": 1.323971,
        "lon": 103.929412
      },
      {
        "code": "EW6",
        "name": "Kembangan",
        "lat": 1.321038,
        "lon": 103.91292
      },
      {
        "code": "EW7",
        "name": "Eunos",
        "lat": 1.319537,
        "lon": 103.902897
      },
      {
        "code": "EW8",
        "name": "Paya Lebar",
        "lat": 1.317825,
        "lon": 103.892201
      },
      {
        "code": "EW9",
        "name": "Aljunied",
        "lat": 1.316363,
        "lon": 103.882485
      },
      {
        "code": "EW10",
        "name": "Kallang",
        "lat": 1.311661,
        "lon": 103.871659
      },
      {
        "code": "EW11",
        "name": "Lavender",
        "lat": 1.307394,
        "lon": 103.862847
      },
      {
        "code": "EW12",
        "name": "Bugis",
        "lat": 1.299914,
        "lon": 103.856562
      },
      {
        "code": "EW13",
        "name": "City Hall",
        "lat": 1.293206,
        "lon": 103.852441
      },
      {
        "code": "EW14",
        "name": "Raffles Place",
        "lat": 1.283704,
        "lon": 103.851415
      },
      {
        "code": "EW15",
        "name": "Tanjong Pagar",
        "lat": 1.276506,
        "lon": 103.846433
      },
      {
        "code": "EW16",
        "name": "Outram Park",
        "lat": 1.280728,
        "lon": 103.839077
      },
      {
        "code": "EW17",
        "name": "Tiong Bahru",
        "lat": 1.286061,
        "lon": 103.827244
      },
      {
        "code": "EW18",
        "name": "Redhill",
        "lat": 1.289428,
        "lon": 103.817122
      },
      {
        "code": "EW19",
        "name": "Queenstown",
        "lat": 1.294852,
        "lon": 103.805893
      },
      {
        "code": "EW20",
        "name": "Commonwealth",
        "lat": 1.302373,
        "lon": 103.798379
      },
      {
        "code": "EW21",
        "name": "Buona Vista",
        "lat": 1.306929,
        "lon": 103.790659
      },
      {
        "code": "EW22",
        "name": "Dover",
        "lat": 1.311554,
        "lon": 103.778385
      },
      {
        "code": "EW23",
        "name": "Clementi",
        "lat": 1.314771,
        "lon": 103.765372
      },
      {
        "code": "EW24",
        "name": "Jurong East",
        "lat": 1.333211,
        "lon": 103.742365
      },
      {
        "code": "EW25",
        "name": "Chinese Garden",
        "lat": 1.341996,
        "lon": 103.732785
      },
      {
        "code": "EW26",
        "name": "Lakeside",
        "lat": 1.344123,
        "lon": 103.721079
      },
      {
        "code": "EW27",
        "name": "Boon Lay",
        "lat": 1.338476,
        "lon": 103.705718
      },
      {
        "code": "EW28",
        "name": "Pioneer",
        "lat": 1.337588,
        "lon": 103.697142
      },
      {
        "code": "EW29",
        "name": "Joo Koon",
        "lat": 1.327729,
        "lon": 103.678582
      },
      {
        "code": "EW30",
        "name": "Gul Circle",
        "lat": 1.318935,
        "lon": 103.65994
      },
      {
        "code": "EW31",
        "name": "Tuas Crescent",
        "lat": 1.321004,
        "lon": 103.649123
      },
      {
        "code": "EW32",
        "name": "Tuas West Road",
        "lat": 1.330027,
        "lon": 103.639538
      },
      {
        "code": "EW33",
        "name": "Tuas Link",
        "lat": 1.340683,
        "lon": 103.637043
      }
    ]
  },
  "CGL": {
    "name": "MRT Changi Airport Branch",
    "color": "009645",
    "headway": [
      6,
      9
    ],
    "stations": [
      {
        "code": "EW4",
        "name": "Tanah Merah",
        "lat": 1.32696,
        "lon": 103.945759
      },
      {
        "code": "CG1",
        "name": "Expo",
        "lat": 1.33518,
        "lon": 103.962394
      },
      {
        "code": "CG2",
        "name": "Changi Airport",
        "lat": 1.356781,
        "lon": 103.988291
      }
    ]
  },
  "NEL": {
    "name": "MRT North East Line",
    "color": "9900aa",
    "headway": [
      3,
      5
    ],
    "stations": [
      {
        "code": "NE1",
        "name": "Harbourfront",
        "lat": 1.265411,
        "lon": 103.8215
      },
      {
        "code": "NE3",
        "name": "Outram Park",
        "lat": 1.280728,
        "lon": 103.839077
      },
      {
        "code": "NE4",
        "name": "Chinatown",
        "lat": 1.284642,
        "lon": 103.844073
      },
      {
        "code": "NE5",
        "name": "Clarke Quay",
        "lat": 1.288616,
        "lon": 103.846565
      },
      {
        "code": "NE6",
        "name": "Dhoby Ghaut",
        "lat": 1.299411,
        "lon": 103.845502
      },
      {
        "code": "NE7",
        "name": "Little India",
        "lat": 1.306748,
        "lon": 103.849279
      },
      {
        "code": "NE8",
        "name": "Farrer Park",
        "lat": 1.312161,
        "lon": 103.854337
      },
      {
        "code": "NE9",
        "name": "Boon Keng",
        "lat": 1.319086,
        "lon": 103.861371
      },
      {
        "code": "NE10",
        "name": "Potong Pasir",
        "lat": 1.331672,
        "lon": 103.869001
      },
      {
        "code": "NE11",
        "name": "Woodleigh",
        "lat": 1.338987,
        "lon": 103.870834
      },
      {
        "code": "NE12",
        "name": "Serangoon",
        "lat": 1.350262,
        "lon": 103.873297
      },
      {
        "code": "NE13",
        "name": "Kovan",
        "lat": 1.35998,
        "lon": 103.884827
      },
      {
        "code": "NE14",
        "name": "Hougang",
        "lat": 1.371432,
        "lon": 103.892464
      },
      {
        "code": "NE15",
        "name": "Buangkok",
        "lat": 1.38303,
        "lon": 103.893173
      },
      {
        "code": "NE16",
        "name": "Sengkang",
        "lat": 1.391719,
        "lon": 103.895489
      },
      {
        "code": "NE17",
        "name": "Punggol",
        "lat": 1.405263,
        "lon": 103.902452
      },
      {
        "code": "NE18",
        "name": "Punggol Coast",
        "lat": 1.414963,
        "lon": 103.910107
      }
    ]
  },
  "CCL": {
    "name": "MRT Circle Line",
    "color": "fa9e0d",
    "headway": [
      4,
      6
    ],
    "stations": [
      {
        "code": "CC1",
        "name": "Dhoby Ghaut",
        "lat": 1.299411,
        "lon": 103.845502
      },
      {
        "code": "CC2",
        "name": "Bras Basah",
        "lat": 1.297001,
        "lon": 103.850526
      },
      {
        "code": "CC3",
        "name": "Esplanade",
        "lat": 1.293194,
        "lon": 103.85568
      },
      {
        "code": "CC4",
        "name": "Promenade",
        "lat": 1.293226,
        "lon": 103.860349
      },
      {
        "code": "CC5",
        "name": "Nicoll Highway",
        "lat": 1.299915,
        "lon": 103.863829
      },
      {
        "code": "CC6",
        "name": "Stadium",
        "lat": 1.302941,
        "lon": 103.875313
      },
      {
        "code": "CC7",
        "name": "Mountbatten",
        "lat": 1.306399,
        "lon": 103.882923
      },
      {
        "code": "CC8",
        "name": "Dakota",
        "lat": 1.308455,
        "lon": 103.888643
      },
      {
        "code": "CC9",
        "name": "Paya Lebar",
        "lat": 1.317825,
        "lon": 103.892201
      },
      {
        "code": "CC10",
        "name": "Macpherson",
        "lat": 1.325871,
        "lon": 103.889558
      },
      {
        "code": "CC11",
        "name": "Tai Seng",
        "lat": 1.335436,
        "lon": 103.888034
      },
      {
        "code": "CC12",
        "name": "Bartley",
        "lat": 1.342875,
        "lon": 103.879582
      },
      {
        "code": "CC13",
        "name": "Serangoon",
        "lat": 1.350262,
        "lon": 103.873297
      },
      {
        "code": "CC14",
        "name": "Lorong Chuan",
        "lat": 1.351589,
        "lon": 103.863926
      },
      {
        "code": "CC15",
        "name": "Bishan",
        "lat": 1.350863,
        "lon": 103.848692
      },
      {
        "code": "CC16",
        "name": "Marymount",
        "lat": 1.348423,
        "lon": 103.839573
      },
      {
        "code": "CC17",
        "name": "Caldecott",
        "lat": 1.337487,
        "lon": 103.840035
      },
      {
        "code": "CC19",
        "name": "Botanic Gardens",
        "lat": 1.32261,
        "lon": 103.815446
      },
      {
        "code": "CC20",
        "name": "Farrer Road",
        "lat": 1.317523,
        "lon": 103.807677
      },
      {
        "code": "CC21",
        "name": "Holland Village",
        "lat": 1.311,
        "lon": 103.795887
      },
      {
        "code": "CC22",
        "name": "Buona Vista",
        "lat": 1.306929,
        "lon": 103.790659
      },
      {
        "code": "CC23",
        "name": "One-North",
        "lat": 1.299794,
        "lon": 103.787546
      },
      {
        "code": "CC24",
        "name": "Kent Ridge",
        "lat": 1.293487,
        "lon": 103.784575
      },
      {
        "code": "CC25",
        "name": "Haw Par Villa",
        "lat": 1.283055,
        "lon": 103.782006
      },
      {
        "code": "CC26",
        "name": "Pasir Panjang",
        "lat": 1.276003,
        "lon": 103.79203
      },
      {
        "code": "CC27",
        "name": "Labrador Park",
        "lat": 1.272107,
        "lon": 103.802356
      },
      {
        "code": "CC28",
        "name": "Telok Blangah",
        "lat": 1.270721,
        "lon": 103.809884
      },
      {
        "code": "CC29",
        "name": "Harbourfront",
        "lat": 1.265411,
        "lon": 103.8215
      },
      {
        "code": "CC30",
        "name": "Keppel",
        "lat": 1.270387,
        "lon": 103.83011
      },
      {
        "code": "CC31",
        "name": "Cantonment",
        "lat": 1.273048,
        "lon": 103.836977
      },
      {
        "code": "CC32",
        "name": "Prince Edward Road",
        "lat": 1.273235,
        "lon": 103.846218
      },
      {
        "code": "CC33",
        "name": "Marina Bay",
        "lat": 1.275451,
        "lon": 103.855131
      },
      {
        "code": "CC34",
        "name": "Bayfront",
        "lat": 1.282089,
        "lon": 103.859205
      }
    ]
  },
  "DTL": {
    "name": "MRT Downtown Line",
    "color": "005ec4",
    "headway": [
      4,
      6
    ],
    "stations": [
      {
        "code": "DT1",
        "name": "Bukit Panjang",
        "lat": 1.379285,
        "lon": 103.761231
      },
      {
        "code": "DT2",
        "name": "Cashew",
        "lat": 1.369833,
        "lon": 103.764234
      },
      {
        "code": "DT3",
        "name": "Hillview",
        "lat": 1.362279,
        "lon": 103.767398
      },
      {
        "code": "DT4",
        "name": "Hume",
        "lat": 1.354946,
        "lon": 103.768674
      },
      {
        "code": "DT5",
        "name": "Beauty World",
        "lat": 1.341087,
        "lon": 103.775732
      },
      {
        "code": "DT6",
        "name": "King Albert Park",
        "lat": 1.335757,
        "lon": 103.783796
      },
      {
        "code": "DT7",
        "name": "Sixth Avenue",
        "lat": 1.331151,
        "lon": 103.796707
      },
      {
        "code": "DT8",
        "name": "Tan Kah Kee",
        "lat": 1.32574,
        "lon": 103.8078
      },
      {
        "code": "DT9",
        "name": "Botanic Gardens",
        "lat": 1.32261,
        "lon": 103.815446
      },
      {
        "code": "DT10",
        "name": "Stevens",
        "lat": 1.320142,
        "lon": 103.825788
      },
      {
        "code": "DT11",
        "name": "Newton",
        "lat": 1.312764,
        "lon": 103.838114
      },
      {
        "code": "DT12",
        "name": "Little India",
        "lat": 1.306748,
        "lon": 103.849279
      },
      {
        "code": "DT13",
        "name": "Rochor",
        "lat": 1.303809,
        "lon": 103.85274
      },
      {
        "code": "DT14",
        "name": "Bugis",
        "lat": 1.299914,
        "lon": 103.856562
      },
      {
        "code": "DT15",
        "name": "Promenade",
        "lat": 1.293226,
        "lon": 103.860349
      },
      {
        "code": "DT16",
        "name": "Bayfront",
        "lat": 1.282089,
        "lon": 103.859205
      },
      {
        "code": "DT17",
        "name": "Downtown",
        "lat": 1.279553,
        "lon": 103.852771
      },
      {
        "code": "DT18",
        "name": "Telok Ayer",
        "lat": 1.282212,
        "lon": 103.848707
      },
      {
        "code": "DT19",
        "name": "Chinatown",
        "lat": 1.284642,
        "lon": 103.844073
      },
      {
        "code": "DT20",
        "name": "Fort Canning",
        "lat": 1.292618,
        "lon": 103.844298
      },
      {
        "code": "DT21",
        "name": "Bencoolen",
        "lat": 1.298365,
        "lon": 103.849892
      },
      {
        "code": "DT22",
        "name": "Jalan Besar",
        "lat": 1.305179,
        "lon": 103.85527
      },
      {
        "code": "DT23",
        "name": "Bendemeer",
        "lat": 1.313667,
        "lon": 103.863147
      },
      {
        "code": "DT24",
        "name": "Geylang Bahru",
        "lat": 1.321335,
        "lon": 103.871675
      },
      {
        "code": "DT25",
        "name": "Mattar",
        "lat": 1.326857,
        "lon": 103.88324
      },
      {
        "code": "DT26",
        "name": "Macpherson",
        "lat": 1.325871,
        "lon": 103.889558
      },
      {
        "code": "DT27",
        "name": "Ubi",
        "lat": 1.329891,
        "lon": 103.899231
      },
      {
        "code": "DT28",
        "name": "Kaki Bukit",
        "lat": 1.335117,
        "lon": 103.909276
      },
      {
        "code": "DT29",
        "name": "Bedok North",
        "lat": 1.334522,
        "lon": 103.918514
      },
      {
        "code": "DT30",
        "name": "Bedok Reservoir",
        "lat": 1.336451,
        "lon": 103.933187
      },
      {
        "code": "DT31",
        "name": "Tampines West",
        "lat": 1.345315,
        "lon": 103.938573
      },
      {
        "code": "DT32",
        "name": "Tampines",
        "lat": 1.354317,
        "lon": 103.943782
      },
      {
        "code": "DT33",
        "name": "Tampines East",
        "lat": 1.356143,
        "lon": 103.955283
      },
      {
        "code": "DT34",
        "name": "Upper Changi",
        "lat": 1.341548,
        "lon": 103.961285
      },
      {
        "code": "DT35",
        "name": "Expo",
        "lat": 1.33518,
        "lon": 103.962394
      }
    ]
  },
  "TEL": {
    "name": "MRT Thomson-East Coast Line",
    "color": "9d5b25",
    "headway": [
      4,
      6
    ],
    "stations": [
      {
        "code": "TE1",
        "name": "Woodlands North",
        "lat": 1.448492,
        "lon": 103.785266
      },
      {
        "code": "TE2",
        "name": "Woodlands",
        "lat": 1.436187,
        "lon": 103.787627
      },
      {
        "code": "TE3",
        "name": "Woodlands South",
        "lat": 1.426972,
        "lon": 103.793958
      },
      {
        "code": "TE4",
        "name": "Springleaf",
        "lat": 1.398097,
        "lon": 103.818159
      },
      {
        "code": "TE5",
        "name": "Lentor",
        "lat": 1.384739,
        "lon": 103.836552
      },
      {
        "code": "TE6",
        "name": "Mayflower",
        "lat": 1.37204,
        "lon": 103.836766
      },
      {
        "code": "TE7",
        "name": "Bright Hill",
        "lat": 1.363167,
        "lon": 103.832869
      },
      {
        "code": "TE8",
        "name": "Upper Thomson",
        "lat": 1.354527,
        "lon": 103.832821
      },
      {
        "code": "TE9",
        "name": "Caldecott",
        "lat": 1.337487,
        "lon": 103.840035
      },
      {
        "code": "TE11",
        "name": "Stevens",
        "lat": 1.320142,
        "lon": 103.825788
      },
      {
        "code": "TE12",
        "name": "Napier",
        "lat": 1.30664,
        "lon": 103.819495
      },
      {
        "code": "TE13",
        "name": "Orchard Boulevard",
        "lat": 1.303044,
        "lon": 103.823767
      },
      {
        "code": "TE14",
        "name": "Orchard",
        "lat": 1.303789,
        "lon": 103.83186
      },
      {
        "code": "TE15",
        "name": "Great World",
        "lat": 1.294296,
        "lon": 103.833092
      },
      {
        "code": "TE16",
        "name": "Havelock",
        "lat": 1.288438,
        "lon": 103.833734
      },
      {
        "code": "TE17",
        "name": "Outram Park",
        "lat": 1.280728,
        "lon": 103.839077
      },
      {
        "code": "TE18",
        "name": "Maxwell",
        "lat": 1.280715,
        "lon": 103.843992
      },
      {
        "code": "TE19",
        "name": "Shenton Way",
        "lat": 1.277471,
        "lon": 103.850936
      },
      {
        "code": "TE20",
        "name": "Marina Bay",
        "lat": 1.275451,
        "lon": 103.855131
      },
      {
        "code": "TE21",
        "name": "Marina South",
        "lat": 1.27402,
        "lon": 103.862211
      },
      {
        "code": "TE22",
        "name": "Gardens By The Bay",
        "lat": 1.279167,
        "lon": 103.867903
      },
      {
        "code": "TE23",
        "name": "Tanjong Rhu",
        "lat": 1.29733,
        "lon": 103.87354
      },
      {
        "code": "TE24",
        "name": "Katong Park",
        "lat": 1.297959,
        "lon": 103.886081
      },
      {
        "code": "TE25",
        "name": "Tanjong Katong",
        "lat": 1.299428,
        "lon": 103.897485
      },
      {
        "code": "TE26",
        "name": "Marine Parade",
        "lat": 1.303777,
        "lon": 103.906844
      },
      {
        "code": "TE27",
        "name": "Marine Terrace",
        "lat": 1.306694,
        "lon": 103.915074
      },
      {
        "code": "TE28",
        "name": "Siglap",
        "lat": 1.309854,
        "lon": 103.929979
      },
      {
        "code": "TE29",
        "name": "Bayshore",
        "lat": 1.312815,
        "lon": 103.941583
      }
    ]
  },
  "BPL": {
    "name": "LRT Bukit Panjang Line",
    "color": "748477",
    "headway": [
      4,
      7
    ],
    "kind": "LRT",
    "stations": [
      {
        "code": "BP1",
        "name": "Choa Chu Kang",
        "lat": 1.38499,
        "lon": 103.744608
      },
      {
        "code": "BP2",
        "name": "South View",
        "lat": 1.380318,
        "lon": 103.745101
      },
      {
        "code": "BP3",
        "name": "Keat Hong",
        "lat": 1.378465,
        "lon": 103.749227
      },
      {
        "code": "BP4",
        "name": "Teck Whye",
        "lat": 1.376564,
        "lon": 103.753826
      },
      {
        "code": "BP5",
        "name": "Phoenix",
        "lat": 1.378614,
        "lon": 103.758252
      },
      {
        "code": "BP6",
        "name": "Bukit Panjang",
        "lat": 1.377959,
        "lon": 103.763054
      },
      {
        "code": "BP7",
        "name": "Petir",
        "lat": 1.377603,
        "lon": 103.766793
      },
      {
        "code": "BP8",
        "name": "Pending",
        "lat": 1.376297,
        "lon": 103.771328
      },
      {
        "code": "BP9",
        "name": "Bangkit",
        "lat": 1.379853,
        "lon": 103.772591
      },
      {
        "code": "BP10",
        "name": "Fajar",
        "lat": 1.384465,
        "lon": 103.770676
      },
      {
        "code": "BP11",
        "name": "Segar",
        "lat": 1.387812,
        "lon": 103.76941
      },
      {
        "code": "BP12",
        "name": "Jelapang",
        "lat": 1.386833,
        "lon": 103.764677
      },
      {
        "code": "BP13",
        "name": "Senja",
        "lat": 1.382875,
        "lon": 103.762326
      }
    ]
  },
  "SKL-E": {
    "name": "LRT Sengkang East Loop",
    "color": "748477",
    "headway": [
      4,
      7
    ],
    "kind": "LRT",
    "stations": [
      {
        "code": "STC",
        "name": "Sengkang",
        "lat": 1.391719,
        "lon": 103.895489
      },
      {
        "code": "SE1",
        "name": "Compassvale",
        "lat": 1.394431,
        "lon": 103.900662
      },
      {
        "code": "SE2",
        "name": "Rumbia",
        "lat": 1.391377,
        "lon": 103.906062
      },
      {
        "code": "SE3",
        "name": "Bakau",
        "lat": 1.388013,
        "lon": 103.905464
      },
      {
        "code": "SE4",
        "name": "Kangkar",
        "lat": 1.38392,
        "lon": 103.902212
      },
      {
        "code": "SE5",
        "name": "Ranggung",
        "lat": 1.384141,
        "lon": 103.897273
      }
    ]
  },
  "SKL-W": {
    "name": "LRT Sengkang West Loop",
    "color": "748477",
    "headway": [
      4,
      7
    ],
    "kind": "LRT",
    "stations": [
      {
        "code": "STC",
        "name": "Sengkang",
        "lat": 1.391719,
        "lon": 103.895489
      },
      {
        "code": "SW1",
        "name": "Cheng Lim",
        "lat": 1.39628,
        "lon": 103.893803
      },
      {
        "code": "SW2",
        "name": "Farmway",
        "lat": 1.397167,
        "lon": 103.889261
      },
      {
        "code": "SW3",
        "name": "Kupang",
        "lat": 1.398221,
        "lon": 103.881139
      },
      {
        "code": "SW4",
        "name": "Thanggam",
        "lat": 1.397195,
        "lon": 103.875627
      },
      {
        "code": "SW5",
        "name": "Fernvale",
        "lat": 1.392158,
        "lon": 103.876262
      },
      {
        "code": "SW6",
        "name": "Layar",
        "lat": 1.392085,
        "lon": 103.880151
      },
      {
        "code": "SW7",
        "name": "Tongkang",
        "lat": 1.38928,
        "lon": 103.886023
      },
      {
        "code": "SW8",
        "name": "Renjong",
        "lat": 1.386756,
        "lon": 103.890424
      }
    ]
  },
  "PGL-E": {
    "name": "LRT Punggol East Loop",
    "color": "748477",
    "headway": [
      4,
      7
    ],
    "kind": "LRT",
    "stations": [
      {
        "code": "PTC",
        "name": "Punggol",
        "lat": 1.404369,
        "lon": 103.901957
      },
      {
        "code": "PE1",
        "name": "Cove",
        "lat": 1.399214,
        "lon": 103.906052
      },
      {
        "code": "PE2",
        "name": "Meridian",
        "lat": 1.396901,
        "lon": 103.908918
      },
      {
        "code": "PE3",
        "name": "Coral Edge",
        "lat": 1.393828,
        "lon": 103.91268
      },
      {
        "code": "PE4",
        "name": "Riviera",
        "lat": 1.394442,
        "lon": 103.916099
      },
      {
        "code": "PE5",
        "name": "Kadaloor",
        "lat": 1.39961,
        "lon": 103.916452
      },
      {
        "code": "PE6",
        "name": "Oasis",
        "lat": 1.402305,
        "lon": 103.9127
      },
      {
        "code": "PE7",
        "name": "Damai",
        "lat": 1.405165,
        "lon": 103.908703
      }
    ]
  },
  "PGL-W": {
    "name": "LRT Punggol West Loop",
    "color": "748477",
    "headway": [
      4,
      7
    ],
    "kind": "LRT",
    "stations": [
      {
        "code": "PTC",
        "name": "Punggol",
        "lat": 1.404369,
        "lon": 103.901957
      },
      {
        "code": "PW1",
        "name": "Sam Kee",
        "lat": 1.409765,
        "lon": 103.904915
      },
      {
        "code": "PW2",
        "name": "Teck Lee",
        "lat": 1.412902,
        "lon": 103.906646
      },
      {
        "code": "PW3",
        "name": "Punggol Point",
        "lat": 1.416789,
        "lon": 103.906756
      },
      {
        "code": "PW4",
        "name": "Samudera",
        "lat": 1.415886,
        "lon": 103.902137
      },
      {
        "code": "PW5",
        "name": "Nibong",
        "lat": 1.411842,
        "lon": 103.900303
      },
      {
        "code": "PW6",
        "name": "Sumang",
        "lat": 1.408428,
        "lon": 103.898546
      },
      {
        "code": "PW7",
        "name": "Soo Teck",
        "lat": 1.40513,
        "lon": 103.897219
      }
    ]
  }
};
