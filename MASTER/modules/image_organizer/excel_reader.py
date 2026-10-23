import openpyxl

class ExcelReader:

    @staticmethod
    def get_headers(excel_file):

        wb = openpyxl.load_workbook(
            excel_file,
            read_only=True,
            data_only=True
        )

        ws = wb.active

        headers = []

        for cell in ws[1]:
            if cell.value:
                headers.append(str(cell.value))

        wb.close()

        return headers