import ExcelJS from 'exceljs';
export async function excelBuffer(terms) {
 const workbook=new ExcelJS.Workbook();workbook.creator='术语簿';workbook.created=new Date();
 const sheet=workbook.addWorksheet('术语库',{views:[{state:'frozen',ySplit:1}]});
 sheet.columns=[{header:'专有名词',key:'name',width:28},{header:'解释',key:'definition',width:70},{header:'英文',key:'english',width:42},{header:'缩写',key:'abbreviation',width:16}];
 for(const term of terms)sheet.addRow(Object.fromEntries(['name','definition','english','abbreviation'].map(key=>[key,String(term[key]||'')])));
 sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF315E48'}};sheet.getRow(1).height=26;
 sheet.eachRow(row=>{row.alignment={vertical:'top',wrapText:true};});sheet.autoFilter='A1:D1';
 return workbook.xlsx.writeBuffer();
}
