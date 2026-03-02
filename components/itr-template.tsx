export interface ITRColumn {
  date: string;
  chainage: string | number;
  l1_150: string | number;
  l1_450: string | number;
  l1_750: string | number;
  l2_150: string | number;
  l2_450: string | number;
  l2_750: string | number;
  l3_150: string | number;
  l3_450: string | number;
  l3_750: string | number;
}

interface ITRTemplateProps {
  reportDate: string;
  reportNumber: number;
  workLocation: string;
  supervisorName: string;
  columns: ITRColumn[];
}

export default function ITRTemplate({
  reportDate,
  reportNumber,
  workLocation,
  supervisorName,
  columns,
}: ITRTemplateProps) {
  return (
    <div>
      <style>
        {`
          @page {
            size: A4;
            margin: 10mm;
          }

          .itr-root {
            font-family: Arial, sans-serif;
            font-size: 11px;
          }

          .itr-root table {
            width: 100%;
            border-collapse: collapse;
          }

          .itr-root td, .itr-root th {
            border: 1px solid #000;
            padding: 4px;
            text-align: center;
          }
        `}
      </style>
      <div className="itr-root">
        <h2>ITR-EXB-003</h2>
        <p>
          <strong>Report Date:</strong> {reportDate}
        </p>
        <p>
          <strong>Report #:</strong> {reportNumber}
        </p>
        <p>
          <strong>Location:</strong> {workLocation}
        </p>
        <p>
          <strong>Supervisor:</strong> {supervisorName}
        </p>

        <table>
          <thead>
            <tr>
              <th>Field</th>
              {columns.map((_, i) => (
                <th key={i}>Col {i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Chainage</td>
              {columns.map((c, i) => (
                <td key={i}>{c.chainage ?? ""}</td>
              ))}
            </tr>
            <tr>
              <td>L1 - 150</td>
              {columns.map((c, i) => (
                <td key={i}>{c.l1_150 ?? ""}</td>
              ))}
            </tr>
            {/* repetís para todos los campos */}
          </tbody>
        </table>
      </div>
    </div>
  );
}
