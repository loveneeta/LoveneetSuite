import os
import shutil


class ImageManager:

    @staticmethod
    def copy_image(src, dest_folder, filename):

        os.makedirs(dest_folder, exist_ok=True)

        destination = os.path.join(
            dest_folder,
            filename
        )

        base, ext = os.path.splitext(destination)

        counter = 1

        while os.path.exists(destination):

            destination = f"{base}_{counter}{ext}"

            counter += 1

        shutil.copy2(src, destination)

        return destination

    # -----------------------------------------------------

    @staticmethod
    def image_exists(path):

        return os.path.isfile(path)

    # -----------------------------------------------------

    @staticmethod
    def create_folder(path):

        os.makedirs(path, exist_ok=True)

    # -----------------------------------------------------

    @staticmethod
    def get_extension(path):

        return os.path.splitext(path)[1]