from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog, ttk

from codex_switch_core import CodexSwitch, Profile, SwitchError


class CodexSwitchApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Codex Switch")
        self.geometry("840x560")
        self.minsize(760, 500)

        self.switch = CodexSwitch()
        self.profiles: list[Profile] = []

        self.codex_dir_var = tk.StringVar(value=str(self.switch.codex_dir))
        self.name_var = tk.StringVar()
        self.base_url_var = tk.StringVar()
        self.api_key_var = tk.StringVar()
        self.active_var = tk.StringVar(value="当前配置: 无")
        self.current_base_url_var = tk.StringVar(value="当前 base_url: 未读取")
        self.current_api_key_var = tk.StringVar(value="当前 OPENAI_API_KEY: 未读取")
        self.path_var = tk.StringVar()

        self._build_ui()
        self.refresh_all()

    def _build_ui(self) -> None:
        root = ttk.Frame(self, padding=14)
        root.pack(fill=tk.BOTH, expand=True)
        root.columnconfigure(0, weight=1)
        root.columnconfigure(1, weight=2)
        root.rowconfigure(2, weight=1)

        title = ttk.Label(root, text="Codex Switch", font=("Microsoft YaHei UI", 16, "bold"))
        title.grid(row=0, column=0, sticky="w")

        active = ttk.Label(root, textvariable=self.active_var)
        active.grid(row=0, column=1, sticky="e")

        dir_frame = ttk.LabelFrame(root, text="Codex 配置目录", padding=10)
        dir_frame.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(12, 0))
        dir_frame.columnconfigure(1, weight=1)

        ttk.Label(dir_frame, text="目录").grid(row=0, column=0, sticky="w", padx=(0, 8))
        ttk.Entry(dir_frame, textvariable=self.codex_dir_var).grid(row=0, column=1, sticky="ew")
        ttk.Button(dir_frame, text="应用", command=self.apply_codex_dir_from_entry).grid(
            row=0, column=2, padx=(8, 0)
        )
        ttk.Button(dir_frame, text="选择文件夹", command=self.choose_codex_dir).grid(
            row=0, column=3, padx=(8, 0)
        )

        list_frame = ttk.LabelFrame(root, text="配置列表", padding=10)
        list_frame.grid(row=2, column=0, sticky="nsew", padx=(0, 12), pady=(12, 0))
        list_frame.rowconfigure(0, weight=1)
        list_frame.columnconfigure(0, weight=1)

        self.profile_list = tk.Listbox(list_frame, exportselection=False, height=12)
        self.profile_list.grid(row=0, column=0, sticky="nsew")
        self.profile_list.bind("<<ListboxSelect>>", self.on_select_profile)

        scrollbar = ttk.Scrollbar(list_frame, command=self.profile_list.yview)
        scrollbar.grid(row=0, column=1, sticky="ns")
        self.profile_list.configure(yscrollcommand=scrollbar.set)

        list_buttons = ttk.Frame(list_frame)
        list_buttons.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(10, 0))
        list_buttons.columnconfigure((0, 1), weight=1)

        ttk.Button(list_buttons, text="切换", command=self.apply_selected).grid(
            row=0, column=0, sticky="ew", padx=(0, 6)
        )
        ttk.Button(list_buttons, text="删除", command=self.delete_selected).grid(
            row=0, column=1, sticky="ew"
        )

        right = ttk.Frame(root)
        right.grid(row=2, column=1, sticky="nsew", pady=(12, 0))
        right.columnconfigure(0, weight=1)
        right.rowconfigure(1, weight=1)

        current = ttk.LabelFrame(right, text="当前文件配置", padding=12)
        current.grid(row=0, column=0, sticky="ew")
        current.columnconfigure(0, weight=1)

        ttk.Label(current, textvariable=self.current_base_url_var).grid(
            row=0, column=0, sticky="w", pady=(0, 6)
        )
        ttk.Label(current, textvariable=self.current_api_key_var).grid(
            row=1, column=0, sticky="w", pady=(0, 6)
        )
        ttk.Label(current, textvariable=self.path_var, foreground="#555").grid(
            row=2, column=0, sticky="w", pady=(4, 0)
        )

        form = ttk.LabelFrame(right, text="配置内容", padding=12)
        form.grid(row=1, column=0, sticky="nsew", pady=(12, 0))
        form.columnconfigure(1, weight=1)

        ttk.Label(form, text="名称").grid(row=0, column=0, sticky="w", pady=(0, 8))
        ttk.Entry(form, textvariable=self.name_var).grid(row=0, column=1, sticky="ew", pady=(0, 8))

        ttk.Label(form, text="基础地址").grid(row=1, column=0, sticky="w", pady=(0, 8))
        ttk.Entry(form, textvariable=self.base_url_var).grid(
            row=1, column=1, sticky="ew", pady=(0, 8)
        )

        ttk.Label(form, text="密钥").grid(row=2, column=0, sticky="w", pady=(0, 8))
        ttk.Entry(form, textvariable=self.api_key_var, show="*").grid(
            row=2, column=1, sticky="ew", pady=(0, 8)
        )

        buttons = ttk.Frame(form)
        buttons.grid(row=3, column=0, columnspan=2, sticky="ew", pady=(8, 0))
        buttons.columnconfigure((0, 1, 2), weight=1)

        ttk.Button(buttons, text="保存配置", command=self.save_current_form).grid(
            row=0, column=0, sticky="ew", padx=(0, 8)
        )
        ttk.Button(buttons, text="清空新增", command=self.clear_form).grid(
            row=0, column=1, sticky="ew", padx=(0, 8)
        )
        ttk.Button(buttons, text="从当前文件导入", command=self.import_current_files).grid(
            row=0, column=2, sticky="ew"
        )

        tip = ttk.Label(
            form,
            text="切换会写入所选目录下的 config.toml 和 auth.json，并在首次切换前创建 .bak 备份。",
            foreground="#555",
        )
        tip.grid(row=4, column=0, columnspan=2, sticky="w", pady=(14, 0))

    def refresh_all(self) -> None:
        self.codex_dir_var.set(str(self.switch.codex_dir))
        self.ensure_default_profile()
        self.refresh_profiles()
        self.refresh_current_file()
        self.refresh_paths()

    def ensure_default_profile(self) -> None:
        try:
            self.switch.ensure_default_profile()
        except SwitchError:
            return

    def refresh_paths(self) -> None:
        self.path_var.set(
            f"config.toml: {self.switch.config_path}\n"
            f"auth.json: {self.switch.auth_path}\n"
            f"数据文件: {self.switch.data_file}"
        )

    def refresh_current_file(self) -> None:
        try:
            current = self.switch.read_current()
        except SwitchError as exc:
            self.current_base_url_var.set("当前 base_url: 读取失败")
            self.current_api_key_var.set(f"当前 OPENAI_API_KEY: {exc}")
            return
        self.current_base_url_var.set(f"当前 base_url: {current.base_url}")
        self.current_api_key_var.set(f"当前 OPENAI_API_KEY: {self._mask_key(current.api_key)}")

    def refresh_profiles(self) -> None:
        try:
            self.profiles = self.switch.list_profiles()
            active = self.switch.get_active_name()
        except SwitchError as exc:
            messagebox.showerror("读取失败", str(exc))
            self.profiles = []
            active = ""

        self.profile_list.delete(0, tk.END)
        for profile in self.profiles:
            marker = "* " if profile.name == active else "  "
            self.profile_list.insert(tk.END, f"{marker}{profile.name}")
        self.active_var.set(f"当前配置: {active or '无'}")

    def choose_codex_dir(self) -> None:
        selected = filedialog.askdirectory(
            title="选择 Codex 配置目录",
            initialdir=str(self.switch.codex_dir),
            parent=self,
        )
        if not selected:
            return
        self.set_codex_dir(Path(selected))

    def apply_codex_dir_from_entry(self) -> None:
        path_text = self.codex_dir_var.get().strip()
        if not path_text:
            messagebox.showwarning("目录不能为空", "请输入或选择 Codex 配置目录")
            return
        self.set_codex_dir(Path(path_text).expanduser())

    def set_codex_dir(self, path: Path) -> None:
        try:
            self.switch.set_codex_dir(path)
        except SwitchError as exc:
            messagebox.showerror("目录保存失败", str(exc))
            return
        self.refresh_all()

    def on_select_profile(self, _event=None) -> None:
        profile = self._selected_profile()
        if not profile:
            return
        self.name_var.set(profile.name)
        self.base_url_var.set(profile.base_url)
        self.api_key_var.set(profile.api_key)

    def save_current_form(self) -> None:
        profile = Profile(
            name=self.name_var.get().strip(),
            base_url=self.base_url_var.get().strip(),
            api_key=self.api_key_var.get().strip(),
        )
        try:
            self.switch.save_profile(profile)
        except SwitchError as exc:
            messagebox.showerror("保存失败", str(exc))
            return
        self.refresh_profiles()
        self._select_profile_by_name(profile.name)
        messagebox.showinfo("已保存", f"配置已保存: {profile.name}")

    def apply_selected(self) -> None:
        profile = self._selected_profile()
        if not profile:
            messagebox.showwarning("请选择配置", "请先从左侧选择一个配置")
            return
        try:
            self.switch.apply_profile(profile.name)
        except SwitchError as exc:
            messagebox.showerror("切换失败", str(exc))
            return
        self.refresh_all()
        self._select_profile_by_name(profile.name)
        messagebox.showinfo("已切换", f"已切换到配置: {profile.name}")

    def delete_selected(self) -> None:
        profile = self._selected_profile()
        if not profile:
            messagebox.showwarning("请选择配置", "请先从左侧选择一个配置")
            return
        if not messagebox.askyesno("确认删除", f"确定删除配置 {profile.name} 吗？"):
            return
        try:
            self.switch.delete_profile(profile.name)
        except SwitchError as exc:
            messagebox.showerror("删除失败", str(exc))
            return
        self.clear_form()
        self.refresh_profiles()

    def import_current_files(self) -> None:
        name = simpledialog.askstring("导入当前文件", "请输入配置名称:", parent=self)
        if not name:
            return
        try:
            profile = self.switch.import_current(name.strip())
        except SwitchError as exc:
            messagebox.showerror("导入失败", str(exc))
            return
        self.refresh_profiles()
        self._select_profile_by_name(profile.name)
        messagebox.showinfo("已导入", f"已从当前文件导入配置: {profile.name}")

    def clear_form(self) -> None:
        self.profile_list.selection_clear(0, tk.END)
        self.name_var.set("")
        self.base_url_var.set("")
        self.api_key_var.set("")

    def _selected_profile(self) -> Profile | None:
        selection = self.profile_list.curselection()
        if not selection:
            return None
        index = selection[0]
        if index >= len(self.profiles):
            return None
        return self.profiles[index]

    def _select_profile_by_name(self, name: str) -> None:
        for index, profile in enumerate(self.profiles):
            if profile.name == name:
                self.profile_list.selection_clear(0, tk.END)
                self.profile_list.selection_set(index)
                self.profile_list.see(index)
                self.on_select_profile()
                return

    def _mask_key(self, api_key: str) -> str:
        if len(api_key) <= 12:
            return "*" * len(api_key)
        return f"{api_key[:7]}...{api_key[-5:]}"


if __name__ == "__main__":
    app = CodexSwitchApp()
    app.mainloop()
