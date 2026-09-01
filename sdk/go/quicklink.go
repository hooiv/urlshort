package quicklink
import("bytes";"encoding/json";"fmt";"io";"net/http";"strings")
type Client struct{BaseURL,APIKey string; HTTP *http.Client}
type Error struct{Status int; Message string; RequestID string}
func(e *Error) Error()string{return fmt.Sprintf("quicklink api %d: %s",e.Status,e.Message)}
func(c *Client) do(path,method string,body any)(map[string]any,error){var b []byte;var err error;if body!=nil{b,err=json.Marshal(body);if err!=nil{return nil,err}};req,err:=http.NewRequest(method,strings.TrimRight(c.BaseURL,"/")+path,bytes.NewReader(b));if err!=nil{return nil,err};req.Header.Set("Authorization","Bearer "+c.APIKey);req.Header.Set("Accept","application/json");req.Header.Set("Content-Type","application/json");hc:=c.HTTP;if hc==nil{hc=http.DefaultClient};res,err:=hc.Do(req);if err!=nil{return nil,err};defer res.Body.Close();raw,readErr:=io.ReadAll(io.LimitReader(res.Body,2<<20));if readErr!=nil{return nil,readErr};if res.StatusCode>=300{var e struct{Error string `json:"error"`;RequestID string `json:"requestId"`};_ = json.Unmarshal(raw,&e);return nil,&Error{Status:res.StatusCode,Message:e.Error,RequestID:e.RequestID}};out:=map[string]any{};if len(raw)>0{if err=json.Unmarshal(raw,&out);err!=nil{return nil,err}};return out,nil}
func(c *Client) Campaigns()(map[string]any,error){return c.do("/api/v1/campaigns","GET",nil)}
func(c *Client) CreateLink(url string)(map[string]any,error){return c.do("/api/shorten","POST",map[string]string{"url":url})}
