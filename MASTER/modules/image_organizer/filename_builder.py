import re


class FilenameBuilder:

    @staticmethod
    def clean(text):

        if text is None:
            return ""

        text = str(text).strip()

        if not text:
            return ""

        # Remove invalid Windows filename characters
        text = re.sub(r'[<>:"/\\|?*]', "", text)

        # Replace spaces with hyphens
        text = text.replace(" ", "-")

        return text

    # ---------------------------------------------------------

    @classmethod
    def build_filename(
        cls,
        row_data,
        filename_fields,
        extension
    ):

        parts = []

        for field in filename_fields:

            value = row_data.get(field, "")

            value = cls.clean(value)

            if value:
                parts.append(value)

        if not parts:
            return f"unnamed{extension}"

        return "_".join(parts) + extension