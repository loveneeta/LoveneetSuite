from difflib import SequenceMatcher


class HeaderMapper:

    """
    Smart Header Detection Engine
    """

    HEADER_ALIASES = {

        "IMAGE": [
            "IMAGE",
            "PHOTO",
            "PICTURE",
            "IMG"
        ],

        "URL": [
            "URL",
            "IMAGE URL",
            "IMAGE PATH",
            "IMAGE LINK",
            "FILE PATH",
            "PATH"
        ],

        "NAME": [
            "NAME",
            "PRODUCT NAME",
            "ITEM NAME",
            "TITLE"
        ],

        "CATEGORY": [
            "CATEGORY",
            "CATOGORY",
            "GROUP"
        ],

        "SUB-CATEGORY": [
            "SUB CATEGORY",
            "SUB-CATEGORY",
            "SUBCATEGORY"
        ],

        "SHAPE": [
            "SHAPE"
        ],

        "MATERIAL": [
            "MATERIAL",
            "MATRIAL"
        ],

        "SUB-MATERIAL": [
            "SUB MATERIAL",
            "SUB-MATERIAL",
            "SUBMATERIAL"
        ],

        "TECHNIQUE": [
            "TECHNIQUE"
        ],

        "PATTERN": [
            "PATTERN",
            "PATTRN"
        ],

        "COLLECTION NAME": [
            "COLLECTION",
            "COLLECTION NAME"
        ],

        "KD": [
            "KD",
            "KEEP DELETE",
            "KEEP/DELETE"
        ],

        "STYLE": [
            "STYLE"
        ],

        "D. YEAR": [
            "D. YEAR",
            "YEAR",
            "YEAR CREATED"
        ]
    }

    # -----------------------------------------------------

    @staticmethod
    def similarity(a, b):

        return SequenceMatcher(
            None,
            a.upper().strip(),
            b.upper().strip()
        ).ratio()

    # -----------------------------------------------------

    @classmethod
    def auto_map(cls, headers):

        result = {}

        for field, aliases in cls.HEADER_ALIASES.items():

            best_score = 0
            best_header = None
            best_index = None

            for i, header in enumerate(headers):

                if header is None:
                    continue

                header = str(header)

                for alias in aliases:

                    score = cls.similarity(
                        header,
                        alias
                    )

                    if score > best_score:

                        best_score = score
                        best_header = header
                        best_index = i

            if best_score >= 0.75:

                result[field] = {

                    "header": best_header,

                    "index": best_index,

                    "score": round(best_score * 100, 1)

                }

        return result